// Запуск читателя памяти `runtime/memory-facts.py` (задача 5.16).
//
// ПОЧЕМУ PYTHON, А НЕ НАШ КОД. Хранилище слоя 2 — встроенный qdrant, и открыть
// его умеет только venv ядра: у приложения нет ни клиента, ни перевода
// настройки `mem0.json` в конфиг mem0. Пишет факты их код — значит и читать их
// должен он, иначе форма записи и форма чтения разъедутся.
//
// ЗОВЁТСЯ, ТОЛЬКО КОГДА ЯДРА НЕТ (задача 3H.21). Живое ядро держит папку
// исключительно, и при нём список идёт его же командой `/aec-memory-facts`;
// отдельный процесс рядом с ним вернул бы отказ (`busy`).

import { spawn } from 'node:child_process'
import { join } from 'node:path'

import type { MemoryFactsAnswer } from '../shared/ipc'

import { readFactsAnswer } from './memory-facts-pure'
import { mainT } from './i18n'

// TODO(Phase 6 / task 6.2): та же оговорка про упакованное приложение, что у
// graph-runner — путь к скрипту внутри репозитория.
function scriptPath(): string {
  return join(__dirname, '../../../../runtime/memory-facts.py')
}

/** Минуты здесь не нужны: чтение идёт с диска. Потолок стоит против зависшего
 *  процесса — без него страница памяти ждала бы вечно. */
export const DEFAULT_FACTS_TIMEOUT_MS = 60 * 1000

export function runMemoryFacts(
  options: {
    args: string[]
    /** Ключи провайдера нашего хранилища — тем же путём, каким их получает
     *  ядро. Читатель сам дольёт `.env` профиля, если ключ живёт там. */
    extraEnv: Record<string, string>
    hermesHome: string
    hermesSrc: string
    python: string
    /** Between the interpreter and the script: `runtime/bin/core_python.py` in an
     *  installed tree (`hermes-env.mjs::PYTHON_ARGS`, task T21.2), nothing in development. */
    pythonArgs?: string[]
  },
  timeoutMs = DEFAULT_FACTS_TIMEOUT_MS
): Promise<MemoryFactsAnswer> {
  return new Promise((resolve) => {
    const proc = spawn(
      options.python,
      [...(options.pythonArgs ?? []), scriptPath(), ...options.args],
      {
        env: {
          ...process.env,
          ...options.extraEnv,
          AEC_HERMES_SRC: options.hermesSrc,
          HERMES_HOME: options.hermesHome,
          MEM0_TELEMETRY: 'false',
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }
    )

    const stdoutChunks: Buffer[] = []
    let settled = false

    const done = (answer: MemoryFactsAnswer): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(answer)
    }

    const timer = setTimeout(() => {
      proc.kill()
      done({ busy: false, error: mainT('memory.readerNoAnswerInTime'), ok: false })
    }, timeoutMs)

    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    // SECURITY: stderr читателя НЕ пересылается человеку и не пишется в журнал.
    // Там бывают строки провайдера с путями и настройкой; причину отказа
    // читатель говорит сам — одной строкой на stdout, вычистив из неё значения
    // окружения профиля.
    proc.stderr.resume()

    proc.on('error', (error: Error) => {
      done({
        busy: false,
        error: mainT('memory.readerSpawnFailed', error.message),
        ok: false
      })
    })

    proc.on('close', () => {
      // Код выхода не проверяется нарочно: читатель отвечает JSON-ом и в случае
      // отказа, а пустой вывод разбор сам назовёт молчанием.
      done(readFactsAnswer(Buffer.concat(stdoutChunks).toString('utf8')))
    })
  })
}
