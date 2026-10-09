// Spawns the aec-rag CLI's `ingest` and `status` commands (task 2.15) — the
// same shape as scan-runner.ts, and for the same reason: the desktop drives
// indexing itself rather than through the agent's tool channel, so the
// indicator works whether or not a session is live.
//
// `ingest` differs from `scan` in one way that matters: it streams. A real
// project takes minutes, so the CLI writes one JSON object per line while it
// runs and the report last. Everything about reading that stream is in
// `ingest-progress-pure.ts`, where it can be tested without a python process.

import { spawn } from 'node:child_process'
import { join } from 'node:path'

import {
  type IngestProgress,
  type IngestReport,
  interruptedFile,
  readIngestLines,
  RunFailedError,
  watchSilence
} from './ingest-progress-pure'
import type { IndexInventory, RagStatus } from '../shared/ipc'

// TODO(Phase 6 / task 6.2): same packaged-app caveat as scan-runner's.
// Python пишет stderr в кодировке консоли Windows, а читаем мы UTF-8 — без этого
// русский отказ `aec-rag` доходит до человека кракозябрами (замер 3G.50).
const AEC_RAG_UTF8 = { PYTHONIOENCODING: 'utf-8' }

function aecRagBinPath(): string {
  const repoRoot = join(__dirname, '../../../../')
  return process.platform === 'win32'
    ? join(repoRoot, '.venv', 'Scripts', 'aec-rag.exe')
    : join(repoRoot, '.venv', 'bin', 'aec-rag')
}

// D-183, task 3H.17: the run ends when it goes quiet, not when it gets long. The
// hour that stood here cut off a folder of scanned reports in the middle of its
// third file (owner's acceptance, 2026-10-07): recognition takes 2–11 s a page
// and a report has hundreds of them, yet every page is a line of output. A
// wedged process says nothing — and fifteen minutes covers the longest silent
// step there is, the embeddings of one large file or Docling on one big DOCX.
export const DEFAULT_INGEST_SILENCE_MS = 15 * 60 * 1000
// Task 3H.16: «Остановить» asks the run to stop at the next file or page, which
// keeps the vector store whole. A page is 2–11 s; if the run has not stopped by
// this, it is ended outright.
export const STOP_GRACE_MS = 20 * 1000
export // A folder of a few hundred files is hashed in seconds; removing a file's
// vectors opens the store once. Minutes mean something hung.
const DEFAULT_PROJECT_FILES_TIMEOUT_MS = 5 * 60_000
const DEFAULT_STATUS_TIMEOUT_MS = 30 * 1000

/** The run was stopped on request and ended before it could report — what it
 *  finished is stored all the same. Not a failure, and not shown as one. */
export class IngestStoppedError extends Error {
  /** Task 3J.9: set when the grace ran out in the middle of a file's text
   *  pass — that file is read again next time, and the person is told so. */
  readonly interrupted: null | { rel_path: string; source_id: string }

  constructor(interrupted: null | { rel_path: string; source_id: string } = null) {
    super('Индексация остановлена')
    this.name = 'IngestStoppedError'
    this.interrupted = interrupted
  }
}

export type IngestOutcome = {
  progress: IngestProgress[]
  report: IngestReport
}

/** Runs `aec-rag ingest --project <vaultPath>`, calling `onProgress` for every
 * event the run reports and resolving with its final report. */
export function runIngest(
  vaultPath: string,
  onProgress: (progress: IngestProgress) => void,
  options: {
    extraEnv?: Record<string, string>
    full?: boolean
    /** Task 3H.18: only these `<source>/<rel path>` files and folders. */
    paths?: string[]
    /** Task 3G.7: drop the index built by another embedding model first. */
    rebuild?: boolean
    /** Task 3H.16: aborting asks the run to stop at the next file or page. */
    signal?: AbortSignal
    silenceMs?: number
  } = {}
): Promise<IngestOutcome> {
  const silenceMs = options.silenceMs ?? DEFAULT_INGEST_SILENCE_MS
  const args = ['ingest', '--project', vaultPath]
  if (options.full) args.push('--full')
  if (options.rebuild) args.push('--rebuild')
  for (const path of options.paths ?? []) args.push('--path', path)

  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagBinPath(), args, {
      // D-115: эмбеддинги берут ключ провайдера из окружения процесса, а ключ
      // человека лежит в нашем зашифрованном хранилище — без него каждый файл
      // падает с «чанки есть, а векторов нет».
      env: { ...process.env, ...options.extraEnv, ...AEC_RAG_UTF8 },
      // stdin is the stop channel (task 3H.16): a line «stop» ends the run at
      // the next file or page.
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const seen: IngestProgress[] = []
    const stderrChunks: Buffer[] = []
    let pending = ''
    let report: IngestReport | undefined
    let fatal: { code: string; detail: string } | undefined
    let settled = false
    let stopRequested = false
    let killedAfterGrace = false
    let graceTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (): void => {
      settled = true
      silence.stop()
      if (graceTimer) clearTimeout(graceTimer)
      options.signal?.removeEventListener('abort', requestStop)
    }

    const silence = watchSilence(silenceMs, () => {
      if (settled) return
      finish()
      proc.kill()
      reject(
        new RunFailedError(
          'silent',
          `aec-rag ingest молчал ${Math.round(silenceMs / 60000)} мин — процесс остановлен. ` +
            'Готовое сохранено; следующий запуск продолжит с места остановки.'
        )
      )
    })

    // Killing the aec-rag.exe launcher ends the python it started (measured
    // 2026-10-07: the child goes with it), so `kill()` on the grace path is
    // enough to free the index.
    function requestStop(): void {
      if (settled || stopRequested) return
      stopRequested = true
      proc.stdin.write('stop\n')
      graceTimer = setTimeout(() => {
        if (settled) return
        killedAfterGrace = true
        proc.kill()
      }, STOP_GRACE_MS)
    }
    if (options.signal?.aborted) requestStop()
    else options.signal?.addEventListener('abort', requestStop)
    // A closed pipe on a process that has just exited must not crash main.
    proc.stdin.on('error', () => undefined)

    // Decoded per chunk rather than at the end: this stream is the progress
    // indicator, and holding it until the process exits would defeat it. A
    // multi-byte character split across a chunk boundary is handled by
    // `readIngestLines`, which only ever hands complete lines on.
    proc.stdout.on('data', (chunk: Buffer) => {
      silence.poke()
      const parsed = readIngestLines(pending + chunk.toString('utf8'))
      pending = parsed.rest
      for (const event of parsed.progress) {
        seen.push(event)
        onProgress(event)
      }
      if (parsed.report) report = parsed.report
      if (parsed.fatal) fatal = parsed.fatal
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      silence.poke()
      stderrChunks.push(chunk)
    })

    proc.on('error', (error: Error) => {
      if (settled) return
      finish()
      reject(new RunFailedError('spawn', `не удалось запустить aec-rag ingest: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      finish()

      const tail = readIngestLines(pending + '\n')
      const finalReport = tail.report ?? report
      fatal = tail.fatal ?? fatal
      if (code !== 0) {
        if (stopRequested) {
          reject(new IngestStoppedError(killedAfterGrace ? interruptedFile(seen) : null))
          return
        }
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        const detail = `aec-rag ingest завершился с ошибкой (код ${code}): ${stderr.trim()}`
        reject(new RunFailedError(fatal?.code ?? 'exit', fatal?.detail || detail))
        return
      }
      if (!finalReport) {
        reject(new RunFailedError('no_report', 'aec-rag ingest не отчитался о результате'))
        return
      }
      resolve({ progress: seen, report: finalReport })
    })
  })
}

/** Runs `aec-rag status --project <vaultPath>`. */
export function runIndexStatus(
  vaultPath: string,
  timeoutMs = DEFAULT_STATUS_TIMEOUT_MS
): Promise<RagStatus> {
  return runOneShot<RagStatus>('status', vaultPath, timeoutMs)
}

/** Task 3J.8/3J.10: `aec-rag inventory` — every file with its index, scan and
 *  graph state. Read-only, like `status`; a big project is one SQLite pass. */
export function runIndexInventory(
  vaultPath: string,
  timeoutMs = DEFAULT_STATUS_TIMEOUT_MS
): Promise<IndexInventory> {
  return runOneShot<IndexInventory>('inventory', vaultPath, timeoutMs)
}

/** Task 3K.4: what `project-include` answers. `selected` — every file the path
 *  names now, marked before or not; `files` — everything marked. */
export interface ProjectIncludeReport {
  added: string[]
  files: string[]
  selected: string[]
}

/** `aec-rag project-include --path <rel>`: mark a vault file or folder for the
 *  index and scan it (SPEC UR45). Indexing is the caller's next step. */
export function runProjectInclude(
  vaultPath: string,
  rel: string,
  timeoutMs = DEFAULT_PROJECT_FILES_TIMEOUT_MS
): Promise<ProjectIncludeReport> {
  return runOneShot<ProjectIncludeReport>('project-include', vaultPath, timeoutMs, ['--path', rel])
}

/** `aec-rag project-exclude --path <rel>`: out of the index and the graph,
 *  then unmarked. Takes the provider env — removing vectors opens the store. */
export function runProjectExclude(
  vaultPath: string,
  rel: string,
  extraEnv: Record<string, string>,
  timeoutMs = DEFAULT_PROJECT_FILES_TIMEOUT_MS
): Promise<{ files: string[] }> {
  return runOneShot<{ files: string[] }>(
    'project-exclude',
    vaultPath,
    timeoutMs,
    ['--path', rel],
    extraEnv
  )
}

/** A short `aec-rag <command> --project <vaultPath>` that answers with one
 *  JSON object. Shared with the graph export (3J.14) and the project files
 *  (3K.4). */
export function runOneShot<T>(
  command: string,
  vaultPath: string,
  timeoutMs: number,
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagBinPath(), [command, '--project', vaultPath, ...extraArgs], {
      env: { ...process.env, ...extraEnv, ...AEC_RAG_UTF8 },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(new Error(`aec-rag ${command} не ответил вовремя`))
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      reject(new Error(`не удалось запустить aec-rag ${command}: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        reject(new Error(`aec-rag ${command} завершился с ошибкой (код ${code}): ${stderr.trim()}`))
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdoutChunks).toString('utf8')) as T)
      } catch (error: unknown) {
        reject(
          new Error(
            `не удалось разобрать ответ aec-rag ${command}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      }
    })
  })
}
