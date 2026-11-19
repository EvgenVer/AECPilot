// Local embedding model: the engine, the model file and the process (task T83,
// UR53; owner decisions 2026-11-18). Rules and constants: `local-embeddings-pure.ts`.
//
// THE ENGINE IS THE CORE'S. Installed by the core's own job
// (`POST /api/local-models/runtime/install`, the same one its local-models screen
// runs): the pinned llama.cpp build for this machine's GPU (`binaries.select_backend`:
// CUDA on NVIDIA, Vulkan on AMD/Intel, else CPU), checked against the core's
// SHA256 pins, into the core's package store. Found with the core's own Python
// (`binaries.installed_engine`) — the store layout is theirs, not ours to guess.
//
// THE PROCESS IS OURS. Started when local embeddings are chosen, stopped with the
// app. Its number is written to the state file, so a leftover from a crash is
// stopped at the next start — only if that number still belongs to llama-server.

import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type {
  LocalEmbeddingsProgress,
  LocalEmbeddingsStatus,
  LocalModelFile,
  LocalModelSearchHit
} from '../shared/ipc'
import { mainT } from './i18n'
import {
  BENCH_CORPUS_CHUNKS,
  DEFAULT_LOCAL_PORT,
  embedMinutes,
  hfFileUrl,
  downloadedModelId,
  isEngineImage,
  isOurServerLine,
  modelFileIn,
  isGgufPath,
  isGpuBackend,
  llamaServerArgs,
  localBaseUrl,
  localModelsDir,
  localStatePath,
  MEASURED_SPEED,
  modelIdForFile,
  parseHfRevision,
  parseLocalState,
  RECOMMENDED_EMBEDDING,
  shouldRestart,
  type LocalEmbeddingState,
  type LocalModel
} from './local-embeddings-pure'

/** The core's interpreter, as `runtime/serve.mjs` hands it out. */
export interface CorePython {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

export interface LocalEmbeddingsDeps {
  hermesHome: () => Promise<string>
  python: () => Promise<CorePython>
  /** A request to the core's REST surface (`hermesRest` with the local target). */
  rest: <T>(
    path: string,
    options?: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> }
  ) => Promise<T>
  /** `null` — the core is ours; text — why the local model cannot be used here. */
  remoteReason: () => string | null
  /** Whether «Локальная модель» is the SAVED choice (review T84): the panel may
   *  download before the person saves, and must not leave a server holding GPU
   *  memory for a choice they then cancel. */
  chosen: () => Promise<boolean>
  onChange: () => void
  /** The Hugging Face model API answer for a repo; the default asks huggingface.co
   *  (tests stand in for it). */
  hfRevision?: (repo: string) => Promise<unknown>
  /** The engine probe; the default asks the core's Python (tests stand in for it). */
  probeEngine?: () => Promise<EngineProbe>
}

async function hfRevisionFromHub(repo: string): Promise<unknown> {
  const response = await fetch(
    `https://huggingface.co/api/models/${repo}/revision/main?blobs=true`,
    {
      signal: AbortSignal.timeout(30_000)
    }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export interface EngineProbe {
  binary: string | null
  backend: string | null
  gpuName: string | null
}

// Prints one JSON line; the core's own imports talk on stderr.
const PROBE_SCRIPT = `
import json, sys
from contextlib import redirect_stdout
with redirect_stdout(sys.stderr):
    from hermes_cli.local_runtime import binaries
    from hermes_cli.local_runtime.bootstrap import _detect_gpu_vendor
    vendor = _detect_gpu_vendor()
    engine = binaries.installed_engine('auto')
    try:
        backend = binaries.resolve_backend('auto', gpu_vendor=vendor)
    except Exception:
        backend = None
print(json.dumps({
    'binary': str(engine.binary) if engine else None,
    'backend': engine.backend if engine else backend,
    'gpu': vendor,
}))
`

const HEALTH_TIMEOUT_MS = 180_000
const POLL_MS = 1000
const STALL_MS = 60_000
const RESTART_DELAY_MS = 2000

/** Whether a process with this number is alive (the owner of a server, see `owner`). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error: unknown) {
    // EPERM: alive, only not ours to signal.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export class LocalEmbeddings {
  private child: ChildProcess | null = null
  private probe: EngineProbe | null = null
  private busy = false
  private progress: LocalEmbeddingsProgress | null = null
  private error: string | null = null
  private stderrTail = ''
  /** A server another app on this profile started and still owns: used, never stopped. */
  private borrowedPort: number | null = null
  private crashes: number[] = []
  private restartTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: LocalEmbeddingsDeps) {}

  // --- state ---------------------------------------------------------------

  private async readState(): Promise<LocalEmbeddingState> {
    try {
      return parseLocalState(readFileSync(localStatePath(await this.deps.hermesHome()), 'utf-8'))
    } catch {
      return {}
    }
  }

  private async writeState(state: LocalEmbeddingState): Promise<void> {
    this.home = await this.deps.hermesHome()
    const path = localStatePath(this.home)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf-8')
  }

  private setProgress(progress: LocalEmbeddingsProgress | null): void {
    this.progress = progress
    this.deps.onChange()
  }

  /** `fresh` — probe the engine again (the window opening: the core's own screen
   *  may have installed it since). */
  async status(fresh = false): Promise<LocalEmbeddingsStatus> {
    const remoteReason = this.deps.remoteReason()
    const state = await this.readState()
    const probe = remoteReason ? null : await this.engine(fresh && !this.busy).catch(() => null)
    const gpu = isGpuBackend(probe?.backend ?? null)
    return {
      remote: remoteReason !== null,
      remoteReason,
      engine: {
        installed: !!probe?.binary,
        backend: probe?.backend ?? null,
        gpuName: probe?.gpuName ?? null
      },
      model: state.model ?? null,
      running: (this.child !== null && this.child.exitCode === null) || this.borrowedPort !== null,
      baseUrl: state.model ? localBaseUrl(state.port ?? DEFAULT_LOCAL_PORT) : null,
      busy: this.busy,
      progress: this.progress,
      error: this.error,
      estimate: {
        gpu,
        chunksPerMinute: Math.round((gpu ? MEASURED_SPEED.gpu : MEASURED_SPEED.cpu) * 60),
        benchChunks: BENCH_CORPUS_CHUNKS,
        benchMinutes: embedMinutes(BENCH_CORPUS_CHUNKS, gpu)
      },
      recommended: {
        id: RECOMMENDED_EMBEDDING.id,
        repo: RECOMMENDED_EMBEDDING.repo,
        file: RECOMMENDED_EMBEDDING.file,
        sizeBytes: RECOMMENDED_EMBEDDING.sizeBytes,
        license: RECOMMENDED_EMBEDDING.license
      }
    }
  }

  // --- the engine (the core's) ---------------------------------------------

  private async engine(force = false): Promise<EngineProbe> {
    if (this.probe && !force) return this.probe
    if (this.deps.probeEngine) return (this.probe = await this.deps.probeEngine())
    const python = await this.deps.python()
    const out = await new Promise<string>((resolve, reject) => {
      execFile(
        python.command,
        [...python.args, '-c', PROBE_SCRIPT],
        { cwd: python.cwd, env: python.env, windowsHide: true, timeout: 60_000 },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      )
    })
    const line = out.trim().split(/\r?\n/).pop() ?? '{}'
    const raw = JSON.parse(line) as { binary?: unknown; backend?: unknown; gpu?: unknown }
    this.probe = {
      binary: typeof raw.binary === 'string' ? raw.binary : null,
      backend: typeof raw.backend === 'string' ? raw.backend : null,
      gpuName: typeof raw.gpu === 'string' ? raw.gpu : null
    }
    return this.probe
  }

  /** The core's install job, followed until it ends. */
  private async installEngine(): Promise<void> {
    const started = await this.deps.rest<{ job_id?: string }>('/api/local-models/runtime/install', {
      method: 'POST',
      body: {}
    })
    const jobId = started.job_id
    if (!jobId) throw new Error(mainT('local.engineMissing'))
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      const job = await this.deps.rest<{
        status?: string
        detail?: string
        error?: string | null
        done_bytes?: number
        total_bytes?: number | null
      }>(`/api/local-models/jobs/${encodeURIComponent(jobId)}`)
      this.setProgress({
        step: 'engine',
        detail: job.detail ?? '',
        doneBytes: job.done_bytes ?? 0,
        totalBytes: job.total_bytes ?? null
      })
      if (job.status === 'done') break
      if (job.status === 'error') {
        throw new Error(mainT('local.engineJob', job.error ?? job.detail ?? job.status))
      }
      // Paused on the core's own local-models screen (technical debt 2026-11-18): not
      // a failure — the job resumes there, and this one waits for it, saying why.
      if (job.status === 'paused') {
        this.setProgress({
          step: 'engine',
          detail: mainT('local.enginePaused'),
          doneBytes: job.done_bytes ?? 0,
          totalBytes: job.total_bytes ?? null
        })
      }
    }
    const probe = await this.engine(true)
    if (!probe.binary) throw new Error(mainT('local.engineMissing'))
  }

  // --- the model file (ours) -----------------------------------------------

  private async chooseModel(model: LocalModel): Promise<void> {
    const state = await this.readState()
    const changed = state.model?.path !== model.path || state.model?.id !== model.id
    await this.writeState({ ...state, model })
    if (changed && this.child) this.stop()
  }

  // --- the jobs the window starts ------------------------------------------

  private async job(work: () => Promise<void>): Promise<{ ok: boolean; error?: string }> {
    const remote = this.deps.remoteReason()
    if (remote) return { ok: false, error: remote }
    if (this.busy) return { ok: false, error: mainT('local.busy') }
    this.busy = true
    this.error = null
    this.deps.onChange()
    try {
      await work()
      return { ok: true }
    } catch (error: unknown) {
      this.error = error instanceof Error ? error.message : String(error)
      return { ok: false, error: this.error }
    } finally {
      this.busy = false
      this.progress = null
      this.deps.onChange()
    }
  }

  /** «Скачать»: the engine if missing, the recommended model if missing, then start. */
  setup(): Promise<{ ok: boolean; error?: string }> {
    return this.job(async () => {
      if (!(await this.engine()).binary) await this.installEngine()
      const dest = join(localModelsDir(await this.deps.hermesHome()), RECOMMENDED_EMBEDDING.file)
      if (!existsSync(dest)) {
        const url = hfFileUrl(
          RECOMMENDED_EMBEDDING.repo,
          RECOMMENDED_EMBEDDING.file,
          RECOMMENDED_EMBEDDING.revision
        )
        if (!url) throw new Error(mainT('local.badSource'))
        await downloadFile(url, dest, RECOMMENDED_EMBEDDING.sha256, (p) => this.setProgress(p))
      }
      await this.chooseModel({
        id: RECOMMENDED_EMBEDDING.id,
        path: dest,
        source: 'download',
        repo: RECOMMENDED_EMBEDDING.repo
      })
      await this.startIfChosen()
    })
  }

  /** Another model from the core's Hugging Face search. */
  downloadOther(repo: string, paths: string[]): Promise<{ ok: boolean; error?: string }> {
    return this.job(async () => {
      if (paths.length === 0) throw new Error(mainT('local.notGguf'))
      const urls = paths.map((path) => hfFileUrl(repo, path))
      if (urls.some((url) => url === null)) throw new Error(mainT('local.badSource'))
      const dir = join(localModelsDir(await this.deps.hermesHome()), repo.replace('/', '__'))
      const files = paths.map((path) => modelFileIn(dir, path))
      if (files.some((file) => file === null)) throw new Error(mainT('local.badSource'))
      // Pinned like the recommended model (technical debt 2026-11-18): the commit the
      // repo is at now and each file's SHA256 from Hugging Face's own record, so what
      // lands is what the hub lists, and a later push to the repo cannot change it.
      const answer = await (this.deps.hfRevision ?? hfRevisionFromHub)(repo).catch(
        (error: unknown) => {
          throw new Error(
            mainT('local.downloadFailed', error instanceof Error ? error.message : String(error))
          )
        }
      )
      const pin = parseHfRevision(answer, paths)
      if (!pin) throw new Error(mainT('local.badSource'))
      const missing = paths.find((path) => !pin.sha256[path])
      if (missing) throw new Error(mainT('local.noChecksum', missing))
      if (!(await this.engine()).binary) await this.installEngine()
      for (const [index, path] of paths.entries()) {
        const file = files[index] as string
        const url = hfFileUrl(repo, path, pin.revision)
        if (!url) throw new Error(mainT('local.badSource'))
        if (!existsSync(file)) {
          await downloadFile(url, file, pin.sha256[path] ?? null, (p) => this.setProgress(p))
        }
      }
      await this.chooseModel({
        id: downloadedModelId(repo, paths[0]),
        path: files[0] as string,
        source: 'download',
        repo
      })
      await this.startIfChosen()
    })
  }

  /** A model file already on this computer: remembered by its path, not copied. */
  useFile(path: string): Promise<{ ok: boolean; error?: string }> {
    return this.job(async () => {
      if (!isGgufPath(path) || !existsSync(path)) throw new Error(mainT('local.notGguf'))
      if (!(await this.engine()).binary) await this.installEngine()
      await this.chooseModel({ id: modelIdForFile(path), path, source: 'file' })
      await this.startIfChosen()
    })
  }

  async search(query: string): Promise<LocalModelSearchHit[]> {
    const answer = await this.deps.rest<{ hits?: Record<string, unknown>[] }>(
      '/api/local-models/search',
      { query: { q: query, limit: '20' } }
    )
    return (answer.hits ?? []).map((hit) => ({
      repo: String(hit.repo ?? ''),
      downloads: Number(hit.downloads ?? 0),
      likes: Number(hit.likes ?? 0),
      gated: hit.gated === true
    }))
  }

  async files(repo: string): Promise<LocalModelFile[]> {
    const answer = await this.deps.rest<{ files?: Record<string, unknown>[] }>(
      '/api/local-models/search/files',
      { query: { repo } }
    )
    return (answer.files ?? []).map((file) => ({
      label: String(file.label ?? ''),
      paths: Array.isArray(file.paths) ? file.paths.map(String) : [],
      totalBytes: Number(file.total_bytes ?? 0)
    }))
  }

  // --- the process ---------------------------------------------------------

  /** Start when a model is chosen; quietly nothing when not. For the app's start
   *  and for a saved choice — errors stay in the status, the window shows them. */
  async ensureRunning(): Promise<void> {
    if (this.deps.remoteReason() || this.busy) return
    if (!(await this.readState()).model) return
    await this.job(() => this.startNow())
  }

  private async startIfChosen(): Promise<void> {
    if (await this.deps.chosen()) await this.startNow()
  }

  private async startNow(): Promise<void> {
    if (this.child && this.child.exitCode === null) return
    const state = await this.readState()
    // Another app on this profile started the server and is still running (technical
    // debt 2026-11-18): use it — never stop it as a leftover nor start a second one.
    // When that app quits, the next start here (indexing runs one) starts our own.
    if (
      state.owner &&
      state.owner !== process.pid &&
      alive(state.owner) &&
      state.port &&
      (await healthy(state.port))
    ) {
      this.borrowedPort = state.port
      return
    }
    this.borrowedPort = null
    const model = state.model
    if (!model) throw new Error(mainT('provider.localNotReady', ''))
    if (!existsSync(model.path)) throw new Error(mainT('local.modelMissing', model.path))
    let engine = await this.engine()
    // The cached probe may be stale: the engine removed on the core's screen or moved
    // by a pin lift (review T84).
    if (engine.binary && !existsSync(engine.binary)) engine = await this.engine(true)
    if (!engine.binary || !existsSync(engine.binary)) throw new Error(mainT('local.engineMissing'))
    // A server whose app is still alive is that app's, even while it is starting up.
    const othersAlive = !!state.owner && state.owner !== process.pid && alive(state.owner)
    if (!othersAlive) await stopLeftover(state.pid, state.port)
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    const port = await pickPort(state.port ?? DEFAULT_LOCAL_PORT)
    this.setProgress({ step: 'start', detail: model.id, doneBytes: 0, totalBytes: null })
    this.stderrTail = ''
    const child = spawn(
      engine.binary,
      llamaServerArgs({
        modelPath: model.path,
        alias: model.id,
        port,
        gpu: isGpuBackend(engine.backend)
      }),
      { cwd: dirname(engine.binary), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
    )
    // Without a listener a failed spawn is an uncaught exception in the main process.
    let spawnError: Error | null = null
    child.on('error', (error) => {
      spawnError = error
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString('utf-8')).slice(-2000)
    })
    child.on('exit', () => {
      if (this.child === child) {
        this.child = null
        void this.forgetPid()
        this.onCrash()
        this.deps.onChange()
      }
    })
    this.child = child
    await this.writeState({
      ...state,
      port,
      owner: process.pid,
      ...(child.pid ? { pid: child.pid } : {})
    })
    try {
      await waitHealthy(port, child, () => spawnError)
    } catch (error: unknown) {
      this.stop()
      const tail = this.stderrTail.trim().split(/\r?\n/).slice(-3).join(' ')
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(mainT('local.startFailed', tail || reason))
    }
  }

  /** A server that exited on its own (not through `stop`) is started again after a
   *  pause, up to three times in ten minutes; then it stays down with the reason in
   *  the window (technical debt 2026-11-18: before, only a saved choice or the next
   *  app start brought it back, and every search failed until then). */
  private onCrash(): void {
    const now = Date.now()
    this.crashes = [...this.crashes, now]
    if (!shouldRestart(this.crashes, now)) {
      const tail = this.stderrTail.trim().split(/\r?\n/).slice(-3).join(' ')
      this.error = mainT('local.crashed', tail || 'exit')
      return
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.deps
        .chosen()
        .then((chosen) => (chosen ? this.ensureRunning() : undefined))
        .catch(() => {})
    }, RESTART_DELAY_MS)
  }

  /** Synchronous on purpose: called from `will-quit`, where nothing awaits. The
   *  recorded number goes too — a clean stop leaves nothing to look for next start. */
  stop(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    this.borrowedPort = null
    const child = this.child
    this.child = null
    if (child && child.exitCode === null) child.kill()
    if (child && this.home) forgetPidSync(this.home)
  }

  private home: string | null = null

  private async forgetPid(): Promise<void> {
    this.home = this.home ?? (await this.deps.hermesHome())
    forgetPidSync(this.home)
  }
}

/** The same as `LocalEmbeddings.target`, read synchronously — for the index
 *  server's environment, which is built in synchronous code. */
export function localTargetSync(hermesHome: string): { baseUrl: string; model: string } | null {
  let state: LocalEmbeddingState = {}
  try {
    state = parseLocalState(readFileSync(localStatePath(hermesHome), 'utf-8'))
  } catch {
    return null
  }
  if (!state.model) return null
  return { baseUrl: localBaseUrl(state.port ?? DEFAULT_LOCAL_PORT), model: state.model.id }
}

/** One file into the models folder: resumed from a `.part`, checked against its
 *  SHA256 when one is known, then renamed into place. */
export async function downloadFile(
  url: string,
  dest: string,
  sha256: string | null,
  onProgress: (progress: LocalEmbeddingsProgress) => void
): Promise<void> {
  const part = dest + '.part'
  mkdirSync(dirname(dest), { recursive: true })
  const have = existsSync(part) ? statSync(part).size : 0
  // A download that stops receiving is aborted, not left holding the panel busy
  // (review T84); the `.part` resumes on the next press.
  const controller = new AbortController()
  let stall = setTimeout(() => controller.abort(), STALL_MS)
  const alive = (): void => {
    clearTimeout(stall)
    stall = setTimeout(() => controller.abort(), STALL_MS)
  }
  const response = await fetch(url, {
    headers: have > 0 ? { Range: `bytes=${have}-` } : {},
    redirect: 'follow',
    signal: controller.signal
  }).catch((error: unknown) => {
    clearTimeout(stall)
    throw new Error(
      mainT('local.downloadFailed', error instanceof Error ? error.message : String(error))
    )
  })
  // 416: the server has nothing past the end — the `.part` was finished before a quit
  // cut the check and the rename short. Verify it instead of failing forever.
  if (response.status === 416 && have > 0) {
    clearTimeout(stall)
    await verifyAndPlace(part, dest, sha256)
    return
  }
  if (!response.ok || !response.body) {
    clearTimeout(stall)
    throw new Error(mainT('local.downloadFailed', `HTTP ${response.status}`))
  }
  const resumed = response.status === 206
  if (!resumed && have > 0) rmSync(part, { force: true })
  const length = Number(response.headers.get('content-length') ?? '0')
  const total = length > 0 ? length + (resumed ? have : 0) : null
  let done = resumed ? have : 0
  let lastTick = 0
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  body.on('data', (chunk: Buffer) => {
    alive()
    done += chunk.length
    const now = Date.now()
    if (now - lastTick > 500) {
      lastTick = now
      onProgress({
        step: 'model',
        detail: dest.replace(/^.*[\\/]/, ''),
        doneBytes: done,
        totalBytes: total
      })
    }
  })
  try {
    await pipeline(body, createWriteStream(part, { flags: resumed ? 'a' : 'w' }))
  } catch (error: unknown) {
    throw new Error(
      mainT('local.downloadFailed', error instanceof Error ? error.message : String(error))
    )
  } finally {
    clearTimeout(stall)
  }
  await verifyAndPlace(part, dest, sha256)
}

async function verifyAndPlace(part: string, dest: string, sha256: string | null): Promise<void> {
  if (sha256) {
    const hash = createHash('sha256')
    await pipeline(createReadStream(part), hash)
    if (hash.digest('hex') !== sha256) {
      rmSync(part, { force: true })
      throw new Error(mainT('local.checksum'))
    }
  }
  renameSync(part, dest)
}

async function pickPort(preferred: number): Promise<number> {
  const tryListen = (port: number): Promise<number | null> =>
    new Promise((resolve) => {
      const server = createServer()
      server.once('error', () => resolve(null))
      server.listen(port, '127.0.0.1', () => {
        const address = server.address()
        const got = typeof address === 'object' && address ? address.port : null
        server.close(() => resolve(got))
      })
    })
  return (await tryListen(preferred)) ?? (await tryListen(0)) ?? preferred
}

async function healthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(3000)
    })
    return response.ok
  } catch {
    return false
  }
}

async function waitHealthy(
  port: number,
  child: ChildProcess,
  spawnError: () => Error | null
): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    const failed = spawnError()
    if (failed) throw failed
    if (child.exitCode !== null) throw new Error(`exit ${child.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(3000)
      })
      if (response.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('health timeout')
}

/** A server left by a crashed run: stopped only while its number is still ours — the
 *  engine's image AND our command line (`--embeddings` on the kept port). The core's
 *  own chat router runs the same executable; its number must never be taken for ours. */
async function stopLeftover(pid: number | undefined, port: number | undefined): Promise<void> {
  if (!pid || !port) return
  const image = await processImage(pid)
  const line = image && isEngineImage(image) ? await processCommandLine(pid) : null
  if (line && isOurServerLine(line, port)) {
    try {
      process.kill(pid)
    } catch {
      // already gone
    }
  }
}

function processCommandLine(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}').CommandLine`
        ],
        { windowsHide: true, timeout: 15_000 },
        (error, stdout) => resolve(error ? null : stdout.trim() || null)
      )
    } else {
      execFile('ps', ['-p', String(pid), '-o', 'args='], (error, stdout) => {
        resolve(error ? null : stdout.trim() || null)
      })
    }
  })
}

function forgetPidSync(hermesHome: string): void {
  try {
    const path = localStatePath(hermesHome)
    const state = parseLocalState(readFileSync(path, 'utf-8'))
    if (state.pid === undefined) return
    delete state.pid
    writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf-8')
  } catch {
    // no state file — nothing recorded
  }
}

function processImage(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      execFile(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { windowsHide: true },
        (error, stdout) => {
          const match = !error && /^"([^"]+)"/.exec(stdout.trim())
          resolve(match ? match[1] : null)
        }
      )
    } else {
      execFile('ps', ['-p', String(pid), '-o', 'comm='], (error, stdout) => {
        resolve(error ? null : stdout.trim().replace(/^.*\//, '') || null)
      })
    }
  })
}
