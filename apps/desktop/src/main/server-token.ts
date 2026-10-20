// Задача T32/T35 (решение владельца 2026-10-19): токен шлюза серверной установки —
// ПОСТОЯННЫЙ. Сервер создаёт его один раз и хранит зашифрованным хранилищем ОС
// (`safeStorage`, на Windows — DPAPI учётной записи, под которой идёт задача при
// входе в систему); клиент вводит его один раз, и перезагрузка сервера ничего не
// ломает. «Выдать новый токен» в меню значка сервера заменяет его — старый перестаёт
// работать после перезапуска шлюза.
//
// ОТКРЫТЫМ ТЕКСТОМ НЕ ПИШЕМ (то же правило, что у `connection.ts`): нет шифрования —
// токен живёт только в памяти этого запуска, и об этом говорит журнал.

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { SecureStore } from './connection'

export interface ServerTokenDeps {
  userDataDir: string
  secure: SecureStore
  log?: (message: string) => void
}

const FILE = 'server-token.json'

export function mintServerToken(): string {
  return randomBytes(24).toString('hex')
}

function file(deps: ServerTokenDeps): string {
  return join(deps.userDataDir, FILE)
}

function save(deps: ServerTokenDeps, token: string): boolean {
  if (!deps.secure.isEncryptionAvailable()) {
    deps.log?.('aecpilot: server token kept in memory only — OS encryption unavailable')
    return false
  }
  const target = file(deps)
  mkdirSync(dirname(target), { recursive: true })
  const body = JSON.stringify({
    encoding: 'safe',
    token: deps.secure.encryptString(token).toString('base64')
  })
  writeFileSync(`${target}.tmp`, `${body}\n`, 'utf-8')
  renameSync(`${target}.tmp`, target)
  return true
}

/** Сохранённый токен или новый (и сохранённый), если его нет или он не читается. */
export function loadOrCreateServerToken(deps: ServerTokenDeps): string {
  const target = file(deps)
  if (existsSync(target) && deps.secure.isEncryptionAvailable()) {
    try {
      const parsed = JSON.parse(readFileSync(target, 'utf-8')) as {
        encoding?: unknown
        token?: unknown
      }
      if (parsed.encoding === 'safe' && typeof parsed.token === 'string') {
        const token = deps.secure.decryptString(Buffer.from(parsed.token, 'base64'))
        if (/^[0-9a-f]{32,}$/.test(token)) return token
      }
    } catch {
      // нечитаемый файл (другая учётная запись, повреждение) — выдаём новый ниже
    }
    deps.log?.('aecpilot: stored server token unreadable — issuing a new one')
  }
  const token = mintServerToken()
  save(deps, token)
  return token
}

/** «Выдать новый токен»: прежний перестаёт действовать с перезапуском шлюза. */
export function rotateServerToken(deps: ServerTokenDeps): string {
  const token = mintServerToken()
  save(deps, token)
  return token
}
