// Подключение к ядру через ssh — сторона процессов (задача 3.12, SPEC UR20).
//
// Решения без побочных действий — в `ssh-pure.ts`; здесь запуск `ssh`, ожидание
// и остановка. Всё внешнее вносится снаружи (`SshDeps`), поэтому проверить
// можно и то, что обычно проверяют только руками: что токен ушёл в стандартный
// ввод, а не в аргументы, и что после отказа за нами не остался процесс.
//
// ТУННЕЛЬ ЖИВЁТ РОВНО СТОЛЬКО, СКОЛЬКО ЯДРО. Проброс и запуск — одна сессия
// `ssh`: она умирает вместе с ядром на той стороне, и не бывает состояния
// «туннель есть, ядра нет», в котором приложение подключено в пустоту.
//
// ТОКЕН НЕ ХРАНИТСЯ. Для ssh он не нужен на диске: ядро на той машине
// поднимаем МЫ, значит и токен назначаем сами — новый на каждое подключение.
// Хранить нечего, а значит нечему и утечь.

import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  classifySshError,
  parseSshConfig,
  parseSshProbe,
  resolveSshHost,
  sshArgs,
  sshErrorMessage,
  sshProbeArgs,
  type SshError,
  type SshHostEntry,
  type SshTarget
} from './ssh-pure'

/** Порт ядра НА ТОЙ машине. Тот же, что у локального `hermes serve`: свой порт
 * для удалённого запуска ничего не улучшил бы, а помнить пришлось бы два. */
export const SSH_REMOTE_PORT = 18789

/** Сколько ждём, пока ядро на той стороне поднимется. Первый запуск там может
 * быть небыстрым — но ждать вечно нельзя: молчащее окно хуже отказа. */
const READY_TIMEOUT_MS = 45_000
const PROBE_INTERVAL_MS = 700

/** Проверка не поднимает ядро, поэтому и ждёт меньше: это один заход на ту
 * машину и три коротких команды. */
const PROBE_TIMEOUT_MS = 20_000

export interface SshDeps {
  spawnSsh: (args: string[]) => ChildProcess
  /** Отвечает ли ядро через туннель. Любой ответ — успех: 401 значит «ядро
   * есть, токен не тот», а нам сейчас важно только «есть». */
  probe: (url: string) => Promise<boolean>
  freePort: () => Promise<number>
  wait: (ms: number) => Promise<void>
  now: () => number
}

const defaultDeps: SshDeps = {
  spawnSsh: (args) => spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }),
  probe: async (url) => {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) })
      return true
    } catch {
      return false
    }
  },
  freePort: () =>
    new Promise((resolve, reject) => {
      const server = createServer()
      server.on('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        const port = typeof address === 'object' && address ? address.port : 0
        server.close(() => (port === 0 ? reject(new Error('нет свободного порта')) : resolve(port)))
      })
    }),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now()
}

let deps: SshDeps = defaultDeps

/** Для тестов: подменяет всё внешнее. */
export function configureSsh(value: Partial<SshDeps>): void {
  deps = { ...defaultDeps, ...value }
}

export interface SshTunnel {
  proc: ChildProcess
  baseUrl: string
  token: string
}

let active: SshTunnel | undefined

/** Куда ходить, пока туннель жив. `undefined` — «сейчас никуда». */
export function activeSshTunnel(): { baseUrl: string; token: string } | undefined {
  return active ? { baseUrl: active.baseUrl, token: active.token } : undefined
}

/** Имена хостов из `~/.ssh/config` — те, что человек уже настроил сам. Файла
 * нет или он нечитаем — пустой список: это не ошибка, а «предложить нечего». */
export function sshConfigHosts(): { hosts: string[] } {
  return { hosts: readSshConfig().map((entry) => entry.alias) }
}

export function sshResolveHost(alias: unknown): {
  hostname: string | null
  identityFile: string | null
  port: number | null
  user: string | null
} {
  const entry = resolveSshHost(readSshConfig(), alias)
  if (!entry) return { hostname: null, identityFile: null, port: null, user: null }

  return {
    hostname: entry.hostName === '' ? null : entry.hostName,
    identityFile: entry.identityFile === '' ? null : entry.identityFile,
    port: entry.port,
    user: entry.user === '' ? null : entry.user
  }
}

function readSshConfig(): SshHostEntry[] {
  // Читается ТОЛЬКО config. Приватные ключи этот код не открывает никогда —
  // ни здесь, ни где-либо ещё: `IdentityFile` для нас путь, а не содержимое.
  const path = join(homedir(), '.ssh', 'config')
  try {
    return existsSync(path) ? parseSshConfig(readFileSync(path, 'utf-8')) : []
  } catch {
    return []
  }
}

export interface SshStartResult {
  ok: boolean
  baseUrl?: string
  sshError?: SshError
  error?: string
}

/**
 * Поднимает ядро на той машине и пробрасывает его порт сюда.
 *
 * Возвращает ОТВЕТ, а не бросает: «не пустил сервер» — это не сбой программы,
 * а состояние, которое человеку надо показать словами и с действием.
 */
export async function startSshTunnel(target: SshTarget): Promise<SshStartResult> {
  await stopSshTunnel()

  const token = randomBytes(24).toString('hex')

  let localPort: number
  try {
    localPort = await deps.freePort()
  } catch (error: unknown) {
    return { ok: false, sshError: 'unknown', error: describe(error) }
  }

  const proc = deps.spawnSsh(sshArgs(target, localPort, SSH_REMOTE_PORT))

  // stderr копится целиком: разбирать его нужно ПОСЛЕ отказа, а к тому времени
  // строка с причиной уже уехала бы.
  let stderr = ''
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf-8')
  })

  let exited = false
  proc.on('exit', () => {
    exited = true
  })
  // Без обработчика ошибка запуска (нет `ssh` в PATH) свалила бы весь процесс.
  proc.on('error', (error: Error) => {
    exited = true
    stderr += `\n${error.message}`
  })

  // Токен — в стандартный ввод: в списке процессов его не будет ни здесь, ни
  // на той машине. Перевод строки обязателен: `read` ждёт именно его.
  proc.stdin?.write(`${token}\n`)
  proc.stdin?.end()

  const baseUrl = `http://127.0.0.1:${localPort}`
  const deadline = deps.now() + READY_TIMEOUT_MS

  while (deps.now() < deadline) {
    if (exited) {
      const sshError = classifySshError(stderr)
      return { ok: false, sshError, error: sshErrorMessage(sshError) }
    }

    if (await deps.probe(`${baseUrl}/api/health`)) {
      active = { proc, baseUrl, token }
      // Сессия может умереть и потом — тогда цель обязана исчезнуть, иначе
      // запросы уйдут в закрытый порт и будут выглядеть как «ядро молчит».
      proc.on('exit', () => {
        if (active?.proc === proc) active = undefined
      })
      return { ok: true, baseUrl }
    }

    await deps.wait(PROBE_INTERVAL_MS)
  }

  await killTunnel(proc)
  return {
    ok: false,
    sshError: 'timeout',
    error:
      'Ядро на той машине не ответило вовремя. Проверьте, что путь к `hermes` верен и он там запускается.'
  }
}

export async function stopSshTunnel(): Promise<void> {
  if (!active) return
  const { proc } = active
  active = undefined
  await killTunnel(proc)
}

async function killTunnel(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return

  proc.kill()
  // Дать сессии закрыться самой: убитый насмерть ssh оставил бы ядро на той
  // стороне без хозяина.
  await deps.wait(300)
  if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface SshProbeResult {
  ok: boolean
  host: string
  remoteHermesPath?: string
  remoteHermesVersion?: string
  remotePlatform?: string
  sshError?: SshError
  error?: string
}

/**
 * «Проверить подключение» — без запуска ядра.
 *
 * Отвечает на вопросы, которые человек задаёт ДО подключения: пустит ли сервер,
 * есть ли там ядро и какое. Живому подключению эта проверка не мешает ничем —
 * она ничего не занимает и ничего не останавливает.
 */
export async function probeSsh(target: SshTarget): Promise<SshProbeResult> {
  const proc = deps.spawnSsh(sshProbeArgs(target))

  let stdout = ''
  let stderr = ''
  let done = false
  let code: number | null = null

  proc.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf-8')
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf-8')
  })
  proc.on('exit', (exitCode: number | null) => {
    code = exitCode
    done = true
  })
  proc.on('error', (error: Error) => {
    stderr += ` ${error.message}`
    done = true
  })

  const deadline = deps.now() + PROBE_TIMEOUT_MS
  while (!done && deps.now() < deadline) await deps.wait(PROBE_INTERVAL_MS)

  if (!done) {
    await killTunnel(proc)
    return { ok: false, host: target.host, sshError: 'timeout', error: sshErrorMessage('timeout') }
  }

  if (code !== 0) {
    const sshError = classifySshError(stderr)
    return { ok: false, host: target.host, sshError, error: sshErrorMessage(sshError) }
  }

  const probe = parseSshProbe(stdout)

  // Сервер пустил, но ядра там нет — это отдельный ответ, и действие у него
  // своё: указать путь, а не чинить доступ.
  if (probe.hermesPath === '') {
    return {
      ok: false,
      host: target.host,
      remotePlatform: probe.platform,
      sshError: 'hermes-not-found',
      error: sshErrorMessage('hermes-not-found')
    }
  }

  return {
    ok: true,
    host: target.host,
    remoteHermesPath: probe.hermesPath,
    remoteHermesVersion: probe.version,
    remotePlatform: probe.platform
  }
}
