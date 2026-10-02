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

import { type IngestProgress, type IngestReport, readIngestLines } from './ingest-progress-pure'
import type { RagStatus } from '../shared/ipc'

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

// An ingest of a real project is parsing, OCR and embedding over hundreds of
// documents — the measurement in 2.9a puts a single ТЗ at 99 s of parsing
// alone. An hour is not a budget, it is a ceiling that keeps a wedged process
// from leaving the indicator spinning forever.
export const DEFAULT_INGEST_TIMEOUT_MS = 60 * 60 * 1000
export const DEFAULT_STATUS_TIMEOUT_MS = 30 * 1000

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
    /** Task 3G.7: drop the index built by another embedding model first. */
    rebuild?: boolean
    timeoutMs?: number
  } = {}
): Promise<IngestOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_INGEST_TIMEOUT_MS
  const args = ['ingest', '--project', vaultPath]
  if (options.full) args.push('--full')
  if (options.rebuild) args.push('--rebuild')

  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagBinPath(), args, {
      // D-115: эмбеддинги берут ключ провайдера из окружения процесса, а ключ
      // человека лежит в нашем зашифрованном хранилище — без него каждый файл
      // падает с «чанки есть, а векторов нет».
      env: { ...process.env, ...options.extraEnv, ...AEC_RAG_UTF8 },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    const seen: IngestProgress[] = []
    const stderrChunks: Buffer[] = []
    let pending = ''
    let report: IngestReport | undefined
    let settled = false

    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(
        new Error(
          `aec-rag ingest не завершился за ${Math.round(timeoutMs / 60000)} мин — процесс принудительно остановлен`
        )
      )
    }, timeoutMs)

    // Decoded per chunk rather than at the end: this stream is the progress
    // indicator, and holding it until the process exits would defeat it. A
    // multi-byte character split across a chunk boundary is handled by
    // `readIngestLines`, which only ever hands complete lines on.
    proc.stdout.on('data', (chunk: Buffer) => {
      const parsed = readIngestLines(pending + chunk.toString('utf8'))
      pending = parsed.rest
      for (const event of parsed.progress) {
        seen.push(event)
        onProgress(event)
      }
      if (parsed.report) report = parsed.report
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      reject(new Error(`не удалось запустить aec-rag ingest: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)

      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        reject(new Error(`aec-rag ingest завершился с ошибкой (код ${code}): ${stderr.trim()}`))
        return
      }
      const tail = readIngestLines(pending + '\n')
      const finalReport = tail.report ?? report
      if (!finalReport) {
        reject(new Error('aec-rag ingest не отчитался о результате'))
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
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagBinPath(), ['status', '--project', vaultPath], {
      env: { ...process.env, ...AEC_RAG_UTF8 },
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
      reject(new Error('aec-rag status не ответил вовремя'))
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      reject(new Error(`не удалось запустить aec-rag status: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        reject(new Error(`aec-rag status завершился с ошибкой (код ${code}): ${stderr.trim()}`))
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdoutChunks).toString('utf8')) as RagStatus)
      } catch (error: unknown) {
        reject(
          new Error(
            `не удалось разобрать ответ aec-rag status: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      }
    })
  })
}
