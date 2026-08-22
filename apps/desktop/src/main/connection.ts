// Подключение к ядру — сторона диска и ключей (задача 3.12, SPEC UR20).
//
// Решения — в `connection-pure.ts`; здесь хранение и единственное место, где
// токен существует в открытом виде дольше одного вызова.
//
// ХРАНИЛИЩЕ ОС, А НЕ НАШ ФАЙЛ. Токен шифруется `safeStorage` — тем же
// механизмом, которым Electron отдаёт приложению ключ из связки ОС. На машине
// без него (некоторые сборки Linux, свежий профиль без keyring) шифровать
// нечем, и тогда действует правило: МЫ НЕ ПИШЕМ ТОКЕН ОТКРЫТЫМ ТЕКСТОМ САМИ.
// Человек может это разрешить — явным согласием, отдельным полем, — и тогда в
// настройках у него стоит видимое напоминание, что токен лежит открытым.
// Молча сохранить в открытом виде значило бы решить за него.
//
// ЗАВИСИМОСТИ ВНЕСЕНЫ СНАРУЖИ (`configureConnection`) не ради «чистоты», а
// чтобы правило выше можно было проверить тестом: подменяется хранилище ключей,
// а не переписывается модуль.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  connectionReady,
  DEFAULT_CONNECTION,
  parseStoredConnection,
  publicConfig,
  readConnectionInput,
  serializeStoredConnection,
  type PublicConnection,
  type StoredConnection
} from './connection-pure'

/** Ровно та часть `safeStorage`, которой мы пользуемся. */
export interface SecureStore {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface ConnectionDeps {
  userDataDir: string
  secure: SecureStore
  /** Переменная окружения перекрывает настройку (режим e2e): подключение уже
   * задано снаружи, и экран об этом должен сказать, а не молча показывать
   * другое. */
  envOverride: boolean
}

let deps: ConnectionDeps | undefined
let stored: StoredConnection = { ...DEFAULT_CONNECTION }

function file(): string {
  return join(deps?.userDataDir ?? '', 'connection.json')
}

export function configureConnection(value: ConnectionDeps): PublicConnection {
  deps = value

  try {
    stored = existsSync(file())
      ? parseStoredConnection(readFileSync(file(), 'utf-8'))
      : { ...DEFAULT_CONNECTION }
  } catch {
    stored = { ...DEFAULT_CONNECTION }
  }

  return connectionView()
}

/** Открытый токен. ЕДИНСТВЕННОЕ место, где он появляется, — и оно в главном
 * процессе. Возвращает пустую строку, если токена нет или расшифровать нечем
 * (ключ ОС сменился, профиль перенесён на другую машину): это не падение, а
 * «подключиться нечем», и человек увидит просьбу ввести токен заново. */
export function connectionToken(): string {
  if (stored.tokenEncoding === 'none' || stored.token === '') return ''
  if (stored.tokenEncoding === 'plain') return stored.token

  try {
    return deps?.secure.decryptString(Buffer.from(stored.token, 'base64')) ?? ''
  } catch (error: unknown) {
    console.warn('aecpilot: stored gateway token could not be decrypted', error)
    return ''
  }
}

export function connectionView(): PublicConnection {
  return publicConfig(stored, {
    secureAvailable: deps?.secure.isEncryptionAvailable() ?? false,
    envOverride: deps?.envOverride ?? false,
    plainToken: connectionToken()
  })
}

/** Куда подключаться. `undefined` — «локально», то есть своим процессом. */
export function remoteTarget(): { baseUrl: string; token: string } | undefined {
  if (stored.mode !== 'remote' || !connectionReady(stored)) return undefined
  return { baseUrl: stored.remoteUrl, token: connectionToken() }
}

export interface SaveOutcome {
  ok: boolean
  config: PublicConnection
  error?: string
}

/**
 * Сохраняет настройку. Токен не трогается, если его не прислали: их экран
 * присылает поле только когда человек его правил, и «пустое поле» там значит
 * «не менял», а не «стереть».
 */
export function saveConnection(raw: unknown): SaveOutcome {
  const input = readConnectionInput(raw)
  const secureAvailable = deps?.secure.isEncryptionAvailable() ?? false

  const next: StoredConnection = {
    mode: input.mode,
    remoteUrl: input.remoteUrl,
    tokenEncoding: stored.tokenEncoding,
    token: stored.token
  }

  if (input.clearToken) {
    next.tokenEncoding = 'none'
    next.token = ''
  } else if (input.remoteToken !== '') {
    if (secureAvailable) {
      try {
        next.token = (deps as ConnectionDeps).secure
          .encryptString(input.remoteToken)
          .toString('base64')
        next.tokenEncoding = 'safe'
      } catch (error: unknown) {
        return {
          ok: false,
          config: connectionView(),
          error: `Не удалось зашифровать токен: ${error instanceof Error ? error.message : String(error)}`
        }
      }
    } else if (input.allowPlainTextToken) {
      next.token = input.remoteToken
      next.tokenEncoding = 'plain'
    } else {
      // Тот самый отказ: молча положить секрет открытым текстом мы не станем.
      return {
        ok: false,
        config: connectionView(),
        error:
          'На этой машине нет безопасного хранилища ключей, поэтому токен можно ' +
          'сохранить только открытым текстом. Это отдельное согласие — подтвердите ' +
          'его, если так и нужно.'
      }
    }
  }

  stored = next

  try {
    writeFileSync(file(), serializeStoredConnection(stored), 'utf-8')
  } catch (error: unknown) {
    return {
      ok: false,
      config: connectionView(),
      error: `Не удалось сохранить настройку подключения: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return { ok: true, config: connectionView() }
}
