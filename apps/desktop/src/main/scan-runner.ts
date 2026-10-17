// Spawns the aec-rag CLI's `scan` command (task 1.14) against a vault — the
// command comes from `aec-rag-command.ts` (task T21.2): the staged MCP Python in
// an installed tree, the uv workspace's console script in development.

import { spawn } from 'node:child_process'
import type { ScanReport } from '../shared/ipc'
import { aecRagArgs, aecRagCommand } from './aec-rag-command'

// Python пишет stderr в кодировке консоли Windows, а читаем мы UTF-8 — без этого
// русский отказ `aec-rag` доходит до человека кракозябрами (замер 3G.50).
const AEC_RAG_UTF8 = { PYTHONIOENCODING: 'utf-8' }

// Review fix (major 1): generous enough not to kill a legitimate first scan
// of a large tree (a fresh source with many thousands of files can take a
// while to hash), but bounded — without this, a hung aec-rag.exe (e.g. a
// stalled SMB share) left the returned promise pending forever, which in
// turn left ScanScheduler.scanning stuck `true` forever: no re-arm, the
// "Сканировать" button stuck on "Сканирование…", and triggerNow() a
// permanent no-op until the whole app was restarted.
export const DEFAULT_SCAN_TIMEOUT_MS = 10 * 60 * 1000

/** Runs `aec-rag scan --project <vaultPath>` and parses its JSON report from
 * stdout. Rejects with a human-readable message on a non-zero exit, a spawn
 * failure (binary missing — e.g. `uv sync` was never run), malformed stdout,
 * or — after `timeoutMs` (default `DEFAULT_SCAN_TIMEOUT_MS`) — a hung
 * process, which is killed before rejecting. */
export function runScan(
  vaultPath: string,
  timeoutMs = DEFAULT_SCAN_TIMEOUT_MS
): Promise<ScanReport> {
  return new Promise((resolve, reject) => {
    const proc = spawn(aecRagCommand(), aecRagArgs(['scan', '--project', vaultPath]), {
      env: { ...process.env, ...AEC_RAG_UTF8 },
      stdio: ['ignore', 'pipe', 'pipe'],
      // Review fix (minor 5): without this, spawning a console-subsystem
      // binary from a GUI app flashes a black console window on every tick.
      windowsHide: true
    })

    // Review fix (minor 3): accumulate raw Buffers and decode once at the
    // end, rather than `chunk.toString()` per chunk — a multi-byte UTF-8
    // character (Cyrillic rel_paths are the norm here) landing across a
    // chunk boundary would otherwise decode to U+FFFD on each side.
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    // Review fix (major 1): kill + reject if the process never closes.
    // Cleared in both the 'close' and 'error' handlers below so it never
    // outlives the promise it belongs to.
    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(
        new Error(
          `aec-rag scan не завершился за ${Math.round(timeoutMs / 60000)} мин — процесс принудительно остановлен`
        )
      )
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      reject(new Error(`не удалось запустить aec-rag scan: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)

      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        reject(new Error(`aec-rag scan завершился с ошибкой (код ${code}): ${stderr.trim()}`))
        return
      }
      try {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8')
        resolve(JSON.parse(stdout) as ScanReport)
      } catch (error: unknown) {
        reject(
          new Error(
            `не удалось разобрать отчёт aec-rag scan: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      }
    })
  })
}

/** `aec-rag detach`'s report shape (task 1.16, mirrors `run_detach` in
 * mcp/aec_rag/src/aec_rag/__main__.py). */
export interface DetachReport {
  source_id: string
  detached: number
}

// Task 1.16: a source disconnect is just an `UPDATE ... WHERE source_id = ?`
// against index.db — nowhere near as long-running as a first scan of a large
// tree, so this timeout is much shorter than `DEFAULT_SCAN_TIMEOUT_MS`; a
// hung/dropped share behind it must not leave the "Отключить" click hanging
// for minutes.
export const DEFAULT_DETACH_TIMEOUT_MS = 30 * 1000

/** Runs `aec-rag detach --project <vaultPath> --source <sourceId>` (task
 * 1.16): marks every `index.db` row for `sourceId` as `detached` — never
 * deletes a row. Called best-effort, right after `removeSourceFromProject`
 * has already removed the source from `project.json` (the `sources:remove`
 * IPC handler in main/index.ts) — a rejection here does not roll that back;
 * `project.json` stays the source of truth. Same rejection contract as
 * `runScan` (non-zero exit, spawn failure, malformed stdout, or a hung
 * process past `timeoutMs`). */
export function runDetach(
  vaultPath: string,
  sourceId: string,
  timeoutMs = DEFAULT_DETACH_TIMEOUT_MS
): Promise<DetachReport> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      aecRagCommand(),
      aecRagArgs(['detach', '--project', vaultPath, '--source', sourceId]),
      {
        env: { ...process.env, ...AEC_RAG_UTF8 },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    )

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(
        new Error(
          `aec-rag detach не завершился за ${Math.round(timeoutMs / 1000)} с — процесс принудительно остановлен`
        )
      )
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    proc.on('error', (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      reject(new Error(`не удалось запустить aec-rag detach: ${error.message}`))
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)

      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        reject(new Error(`aec-rag detach завершился с ошибкой (код ${code}): ${stderr.trim()}`))
        return
      }
      try {
        const stdout = Buffer.concat(stdoutChunks).toString('utf8')
        resolve(JSON.parse(stdout) as DetachReport)
      } catch (error: unknown) {
        reject(
          new Error(
            `не удалось разобрать отчёт aec-rag detach: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        )
      }
    })
  })
}
