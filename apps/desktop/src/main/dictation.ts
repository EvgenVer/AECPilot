// Local dictation (UR49, task T59): the model on disk, the person's consent to download it
// and the voice keys of every profile. Recognition itself is the core's
// (`POST /api/audio/transcribe`, faster-whisper in its own process). Rules:
// `dictation-pure.ts`.

import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

import type { DictationStatus } from '../shared/ipc'
import {
  applyDictationConfig,
  coreRecognisesLocally,
  DICTATION_MARKER,
  DICTATION_MODEL,
  dictationFileUrl,
  dictationModelBytes,
  dictationModelDir,
  dictationModelsRoot,
  gatewayJsonWithoutVoice,
  isDictationFolder,
  parseDictationMarker,
  type DictationMarker
} from './dictation-pure'
import { mainT } from './i18n'
import { downloadFile, type CorePython } from './local-embeddings'

export interface DictationDeps {
  hermesHome: () => Promise<string>
  python: () => Promise<CorePython>
  /** The core is on another machine: the model and the config live there, not here. */
  remote: () => boolean
  /** The config the connected core runs on, for the profile a recording goes to. */
  coreConfig: (profile: string | null) => Promise<unknown>
  onChange: () => void
  /** Tests stand in for the network and the core's Python. */
  download?: typeof downloadFile
  probeEngine?: () => Promise<boolean>
  freeBytes?: (dir: string) => number
}

/** Room left for the disk to stay usable after the model has landed. */
const SPARE_BYTES = 300_000_000

/** Whole or not at all: the core may read the file at any moment. */
function replaceFile(path: string, text: string): void {
  const next = `${path}.aec-${process.pid}.tmp`
  try {
    writeFileSync(next, text, 'utf-8')
    renameSync(next, path)
  } finally {
    rmSync(next, { force: true })
  }
}

/** Whether the model folder holds a finished, verified download. Sizes, not checksums:
 *  half a gigabyte is hashed once, when it lands. */
export function dictationInstalled(hermesHome: string): boolean {
  const dir = dictationModelDir(hermesHome)
  try {
    const marker = parseDictationMarker(readFileSync(join(dir, DICTATION_MARKER), 'utf-8'))
    if (!marker || marker.id !== DICTATION_MODEL.id) return false
    if (marker.revision !== DICTATION_MODEL.revision) return false
    return marker.files.every((file) => statSync(join(dir, file.name)).size === file.size)
  } catch {
    return false
  }
}

/** The main profile and every specialist's: each has its own `config.yaml`, and a chat of a
 *  specialist is recognised with the specialist's settings. */
function profileHomes(hermesHome: string): string[] {
  const homes = [hermesHome]
  try {
    for (const entry of readdirSync(join(hermesHome, 'profiles'), { withFileTypes: true })) {
      if (entry.isDirectory()) homes.push(join(hermesHome, 'profiles', entry.name))
    }
  } catch {
    // no specialists yet
  }
  return homes
}

/**
 * Writes the voice keys into every profile (HX19, UR49) and keeps the messengers' voice
 * messages out of recognition. Called at every start before the core, after a specialist is
 * created, before every recording, and whenever dictation is switched on or off. `false` —
 * something could not be brought to order. It is not what lets a recording start: that is
 * the core's own answer (`coreRecognisesLocally`).
 */
export function holdVoiceConfig(hermesHome: string, enabled: boolean): boolean {
  const modelDir = enabled ? dictationModelDir(hermesHome) : null
  let ok = true
  for (const home of profileHomes(hermesHome)) {
    const configPath = join(home, 'config.yaml')
    try {
      if (existsSync(configPath)) {
        const result = applyDictationConfig(readFileSync(configPath, 'utf-8'), modelDir)
        if (!result.ok) {
          console.warn(`aecpilot: voice keys of ${configPath} could not be brought to order`)
          ok = false
        }
        if (result.changed) replaceFile(configPath, result.text)
      }
      const gatewayPath = join(home, 'gateway.json')
      const next = gatewayJsonWithoutVoice(
        existsSync(gatewayPath) ? readFileSync(gatewayPath, 'utf-8') : null
      )
      if (!next.ok) {
        console.warn(`aecpilot: ${gatewayPath} is broken — voice messages cannot be held off`)
        ok = false
      }
      if (next.text !== null) replaceFile(gatewayPath, next.text)
    } catch (error: unknown) {
      console.error(`aecpilot: could not hold the voice keys of ${home}`, error)
      ok = false
    }
  }
  return ok
}

/** Folders of ours under the models root, finished or not; nothing else there is touched. */
function ownFolders(hermesHome: string): string[] {
  const root = dictationModelsRoot(hermesHome)
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isDictationFolder(entry.name))
      .map((entry) => join(root, entry.name))
  } catch {
    return []
  }
}

function freeBytes(dir: string): number {
  const disk = statfsSync(dir)
  return disk.bavail * disk.bsize
}

const ENGINE_SCRIPT =
  "import importlib.util as u; print('yes' if u.find_spec('faster_whisper') and u.find_spec('av') else 'no')"

export class Dictation {
  private busy = false
  private progress: { doneBytes: number; totalBytes: number } | null = null
  private error: string | null = null
  private engine: boolean | null = null

  constructor(private readonly deps: DictationDeps) {}

  async status(): Promise<DictationStatus> {
    const model = {
      id: DICTATION_MODEL.id,
      repo: DICTATION_MODEL.repo,
      license: DICTATION_MODEL.license,
      sizeBytes: dictationModelBytes()
    }
    const base = { model, busy: this.busy, progress: this.progress, leftovers: false }
    if (this.deps.remote()) {
      const ready = await this.mayRecord()
      return { ...base, error: null, remote: true, engine: true, installed: ready, ready }
    }
    const home = await this.deps.hermesHome()
    const installed = dictationInstalled(home)
    const engine = await this.engineReady()
    const able = installed && engine && !this.busy
    const ready = able && (await this.mayRecord())
    return {
      ...base,
      error: this.error ?? (able && !ready ? mainT('dictation.blocked') : null),
      remote: false,
      engine,
      installed,
      leftovers: !installed && !this.busy && ownFolders(home).length > 0,
      ready
    }
  }

  /** Asked before the microphone opens and again before the recording is sent: the keys may
   *  have drifted (the agent edits `config.yaml` too), and a drifted `stt.provider` would
   *  send the sound to a cloud service. `profile` — whose settings will recognise it. */
  async mayRecord(profile: string | null = null): Promise<boolean> {
    try {
      const remote = this.deps.remote()
      let modelDir: string | null = null
      if (!remote) {
        const home = await this.deps.hermesHome()
        if (this.busy || !dictationInstalled(home) || !(await this.engineReady())) return false
        holdVoiceConfig(home, true)
        modelDir = dictationModelDir(home)
      }
      return coreRecognisesLocally(await this.deps.coreConfig(profile), modelDir)
    } catch (error: unknown) {
      console.error('aecpilot: could not ask the core whether dictation is local', error)
      return false
    }
  }

  /** The core's `faster_whisper` package; the packages cannot change while the app runs. */
  private async engineReady(): Promise<boolean> {
    if (this.engine !== null) return this.engine
    if (this.deps.probeEngine) return (this.engine = await this.deps.probeEngine())
    try {
      const python = await this.deps.python()
      const out = await new Promise<string>((resolve, reject) => {
        execFile(
          python.command,
          [...python.args, '-c', ENGINE_SCRIPT],
          { cwd: python.cwd, env: python.env, windowsHide: true, timeout: 60_000 },
          (error, stdout) => (error ? reject(error) : resolve(stdout))
        )
      })
      this.engine = out.trim().endsWith('yes')
      return this.engine
    } catch (error: unknown) {
      // Not remembered: a probe that failed to start says nothing about the packages.
      console.error('aecpilot: could not ask the core for the recognition packages', error)
      return false
    }
  }

  /** «Скачать и включить»: every missing file with its checksum, the marker, the config. */
  async setup(): Promise<{ ok: boolean; error?: string }> {
    if (this.deps.remote()) return { ok: false, error: mainT('dictation.remote') }
    if (this.busy) return { ok: false, error: mainT('local.busy') }
    this.busy = true
    this.error = null
    this.deps.onChange()
    try {
      if (!(await this.engineReady())) throw new Error(mainT('dictation.engineMissing'))
      const home = await this.deps.hermesHome()
      if (!dictationInstalled(home)) await this.download(home)
      if (!holdVoiceConfig(home, true)) {
        // Not half on: the profiles that could be written go back to off.
        holdVoiceConfig(home, false)
        throw new Error(mainT('dictation.configFailed'))
      }
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

  private async download(home: string): Promise<void> {
    const dir = dictationModelDir(home)
    const totalBytes = dictationModelBytes()
    let before = 0
    mkdirSync(dir, { recursive: true })
    const free = (this.deps.freeBytes ?? freeBytes)(dir)
    if (free < totalBytes + SPARE_BYTES) {
      throw new Error(mainT('dictation.noSpace', Math.ceil((totalBytes + SPARE_BYTES) / 1_000_000)))
    }
    rmSync(join(dir, DICTATION_MARKER), { force: true })
    for (const file of DICTATION_MODEL.files) {
      const dest = join(dir, file.name)
      // A file of the right size was verified when it was renamed into place.
      if (!existsSync(dest) || statSync(dest).size !== file.size) {
        const done = before
        await (this.deps.download ?? downloadFile)(
          dictationFileUrl(DICTATION_MODEL, file),
          dest,
          file.sha256,
          (progress) => {
            this.progress = { doneBytes: done + progress.doneBytes, totalBytes }
            this.deps.onChange()
          }
        )
      }
      before += file.size
      this.progress = { doneBytes: before, totalBytes }
      this.deps.onChange()
    }
    const marker: DictationMarker = {
      id: DICTATION_MODEL.id,
      revision: DICTATION_MODEL.revision,
      files: DICTATION_MODEL.files.map(({ name, size }) => ({ name, size }))
    }
    writeFileSync(join(dir, DICTATION_MARKER), JSON.stringify(marker, null, 2) + '\n', 'utf-8')
    // The model of an earlier version is of no use any more.
    for (const folder of ownFolders(home)) {
      if (folder !== dir) rmSync(folder, { recursive: true, force: true })
    }
  }

  /** «Удалить модель»: recognition off first, then the files — never the other way round,
   *  so the core is not left pointing at a folder that is gone. */
  async remove(): Promise<{ ok: boolean; error?: string }> {
    if (this.deps.remote()) return { ok: false, error: mainT('dictation.remote') }
    if (this.busy) return { ok: false, error: mainT('local.busy') }
    this.error = null
    try {
      const home = await this.deps.hermesHome()
      if (!holdVoiceConfig(home, false)) throw new Error(mainT('dictation.configFailed'))
      try {
        for (const folder of ownFolders(home)) {
          // The big file first: it is the one a core that has just recognised something may
          // still hold open, and then the folder stays whole — installed, not half gone.
          rmSync(join(folder, 'model.bin'), { force: true })
          rmSync(folder, { recursive: true, force: true })
        }
      } catch (error: unknown) {
        console.error('aecpilot: the dictation model was not removed', error)
        if (dictationInstalled(home)) holdVoiceConfig(home, true)
        throw new Error(mainT('dictation.removeBusy'), { cause: error })
      }
      return { ok: true }
    } catch (error: unknown) {
      this.error = mainT('dictation.removeFailed', error instanceof Error ? error.message : '')
      return { ok: false, error: this.error }
    } finally {
      this.deps.onChange()
    }
  }
}
