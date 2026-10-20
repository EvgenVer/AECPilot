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

import { activeSshTunnel } from './ssh'
import {
  connectionReady,
  DEFAULT_CONNECTION,
  parseStoredConnection,
  publicConfig,
  readConnectionInput,
  serializeStoredConnection,
  type PublicConnection,
  type SshSettings,
  type StoredConnection
} from './connection-pure'
import { mainT } from './i18n'

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

/** Куда подключаться. `undefined` — «локально», то есть своим процессом.
 *
 * У ssh ответ зависит от ЖИВОГО туннеля, а не от настройки: пока сессии нет,
 * подключаться некуда, и притвориться, что есть, значило бы отправлять запросы
 * в закрытый порт. */
export function remoteTarget(): { baseUrl: string; token: string } | undefined {
  if (stored.mode === 'ssh') return activeSshTunnel()
  if (stored.mode !== 'remote' || !connectionReady(stored)) return undefined
  return { baseUrl: stored.remoteUrl, token: connectionToken() }
}

/** Настройка ssh — её читает тот, кто поднимает туннель. */
export function sshSettings(): SshSettings {
  return stored.ssh
}

export function connectionMode(): 'local' | 'remote' | 'ssh' {
  return stored.mode
}

export interface SaveOutcome {
  ok: boolean
  config: PublicConnection
  error?: string
}

/**
 * Сохраняет настройку.
 *
 * ОДНО ПРАВИЛО НА ВСЮ ФОРМУ: чего в запросе не было — то не менялось. Их экран
 * присылает поля по частям (токен — только когда человек его правил), и молчание
 * о поле не должно его стирать. Иначе переключение режима заставляло бы
 * набирать адрес и настройку ssh заново.
 */
export function saveConnection(raw: unknown): SaveOutcome {
  const input = readConnectionInput(raw)
  const secureAvailable = deps?.secure.isEncryptionAvailable() ?? false

  const next: StoredConnection = {
    mode: input.mode,
    // Присланное заменяет, отсутствующее остаётся: переключить режим — не
    // значит стереть настройку, к которой человек собирается вернуться.
    remoteUrl: input.remoteUrl ?? stored.remoteUrl,
    remoteProfile: input.remoteProfile ?? stored.remoteProfile,
    tokenEncoding: stored.tokenEncoding,
    token: stored.token,
    ssh: { ...stored.ssh, ...input.ssh }
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
          error: mainT(
            'connection.encryptFailed',
            error instanceof Error ? error.message : String(error)
          )
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
        error: mainT('connection.plainTextConsent')
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
      error: mainT('connection.saveFailed', error instanceof Error ? error.message : String(error))
    }
  }

  return { ok: true, config: connectionView() }
}
