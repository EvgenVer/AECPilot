// Spawns the aec-rag CLI's `scan` command (task 1.14) against a vault —
// mirrors main/index.ts's dynamic-import-relative-to-__dirname convention
// for runtime/serve.mjs and the AGENTS.md template (see agentsTemplatePath),
// and runtime/register-aec-sources.mjs's AEC_SOURCES_BIN resolution: the uv
// workspace's compiled console-script binary at `<repo root>/.venv`.

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ScanReport } from '../shared/ipc'

// TODO(Phase 5 / task 5.1): __dirname will live inside app.asar in the
// packaged app — this relative path to the repo-root .venv must be revisited
// for the bundled layout (same caveat as index.ts's loadServeModule/
// agentsTemplatePath).
function aecRagBinPath(): string {
  const repoRoot = join(__dirname, '../../../../')
  return process.platform === 'win32'
    ? join(repoRoot, '.venv', 'Scripts', 'aec-rag.exe')
    : join(repoRoot, '.venv', 'bin', 'aec-rag')
}

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
    const proc = spawn(aecRagBinPath(), ['scan', '--project', vaultPath], {
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
