// Второй рубеж сверки выдержек (SPEC UR26, задача 3.31b): приложение
// перепроверяет каждую выдержку в готовом ответе по тексту процитированного
// места.
//
// Зачем второй раз, если у агента есть инструмент проверки: замер 3.22 показал,
// что инструмент он обходит ровно там, где тот бы его не пропустил. Этот рубеж
// от доброй воли модели не зависит.
//
// Тот же способ, что у `runIndexStatus`, — короткий процесс `aec-rag`. Отличие
// одно: текст ответа уходит в stdin, а не в аргумент. Ответ бывает в тысячи
// символов, и командная строка Windows на них кончается.

import { spawn } from 'node:child_process'
import { join } from 'node:path'

export type QuoteVerdict = {
  text: string
  start: number
  end: number
  ok: boolean
  reason: string
}

export type QuoteCheckResult =
  { available: true; quotes: QuoteVerdict[] } | { available: false; reason: string; quotes: [] }

// TODO(Phase 6 / task 6.2): тот же вопрос об упакованном приложении, что и у
// scan-runner/ingest-runner.
// Python пишет stderr в кодировке консоли Windows, а читаем мы UTF-8 — без этого
// русский отказ `aec-rag` доходит до человека кракозябрами (замер 3G.50).
const AEC_RAG_UTF8 = { PYTHONIOENCODING: 'utf-8' }

function aecRagBinPath(): string {
  const repoRoot = join(__dirname, '../../../../')
  return process.platform === 'win32'
    ? join(repoRoot, '.venv', 'Scripts', 'aec-rag.exe')
    : join(repoRoot, '.venv', 'bin', 'aec-rag')
}

/** Один процесс на ответ, а не на выдержку. */
export const DEFAULT_CHECK_TIMEOUT_MS = 30 * 1000

/** `hermesHome` приходит снаружи (его знает `runtime/serve.mjs`, и главный
 * процесс берёт его там же, где всё остальное про ядро): матчер выдержек живёт
 * в скиле ядра, а ядро вычищает окружение своим детям, поэтому путь передаётся
 * явно — ровно как в `register-aec-rag.mjs`. */
export function runQuoteCheck(
  vaultPath: string,
  answer: string,
  hermesHome: string,
  timeoutMs = DEFAULT_CHECK_TIMEOUT_MS
): Promise<QuoteCheckResult> {
  return new Promise((resolve) => {
    const proc = spawn(aecRagBinPath(), ['check-quotes', '--project', vaultPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, AEC_HERMES_HOME: hermesHome, ...AEC_RAG_UTF8 }
    })

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let settled = false

    /** Провал проверки — это «проверка не состоялась», а не «всё хорошо».
     * Молчаливое «ок» убрало бы гарантию, оставив её вид. */
    const unavailable = (reason: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ available: false, reason, quotes: [] })
    }

    const timer = setTimeout(() => {
      proc.kill()
      unavailable('проверка выдержек не ответила вовремя')
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk))
    proc.on('error', (error: Error) =>
      unavailable(`не удалось запустить проверку: ${error.message}`)
    )

    // Ответ уходит в UTF-8 явно: на стороне питона он так же явно и читается,
    // иначе русский текст приезжает искажённым и сверять его бессмысленно.
    proc.stdin.on('error', () => unavailable('проверка выдержек оборвалась на записи'))
    proc.stdin.end(Buffer.from(answer, 'utf8'))

    proc.on('close', (code) => {
      if (settled) return
      if (code !== 0) {
        unavailable(Buffer.concat(stderrChunks).toString('utf8').trim() || `код ${code}`)
        return
      }
      settled = true
      clearTimeout(timer)
      try {
        resolve(JSON.parse(Buffer.concat(stdoutChunks).toString('utf8')) as QuoteCheckResult)
      } catch {
        settled = false
        unavailable('проверка выдержек ответила неразборчиво')
      }
    })
  })
}
