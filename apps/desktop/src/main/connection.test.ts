// Задача 3.12 (SPEC UR20). Проверяется обещание verify дословно: токен не виден
// рендереру И не лежит открытым в файле настроек. Работа с НАСТОЯЩИМ файлом во
// временной папке: предмет проверки — что оказалось на диске.

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configureConnection,
  connectionToken,
  connectionView,
  remoteTarget,
  saveConnection,
  type SecureStore
} from './connection'

const TOKEN = 'gateway-token-abcdefgh1234'

let dir = ''

/** Хранилище ключей ОС — подменяемое, чтобы проверить обе машины: ту, где
 * шифрование есть, и ту, где его нет. «Шифрование» здесь обратимое и заведомо
 * не секретное: проверяется НЕ криптография, а то, что открытый токен не
 * оказывается в файле. */
function fakeSecure(available: boolean): SecureStore {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf-8'),
    decryptString: (buffer) => buffer.toString('utf-8').replace(/^enc:/, '')
  }
}

function stored(): string {
  const path = join(dir, 'connection.json')
  return existsSync(path) ? readFileSync(path, 'utf-8') : ''
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aec-connection-'))
})

afterEach(() => {
  rmSync(dir, { force: true, recursive: true })
})

describe('машина с хранилищем ключей', () => {
  beforeEach(() => {
    configureConnection({ userDataDir: dir, secure: fakeSecure(true), envOverride: false })
  })

  it('токен сохраняется зашифрованным — открытым текстом его в файле нет', () => {
    const outcome = saveConnection({
      mode: 'remote',
      remoteUrl: 'https://hermes.example.org',
      remoteToken: TOKEN
    })

    expect(outcome.ok).toBe(true)
    expect(stored(), 'вот это и есть обещание задачи').not.toContain(TOKEN)
    expect(stored()).toContain('"tokenEncoding": "safe"')
  })

  it('окну токен не отдаётся ни в каком виде', () => {
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })

    const view = JSON.stringify(connectionView())

    expect(view).not.toContain(TOKEN)
    expect(view).not.toContain('enc:')
    expect(connectionView().remoteTokenSet).toBe(true)
    expect(connectionView().remoteTokenPreview).toBe('••••1234')
  })

  it('главный процесс токен получает — иначе подключаться нечем', () => {
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })

    expect(connectionToken()).toBe(TOKEN)
    expect(remoteTarget()).toEqual({ baseUrl: 'https://h.example.org', token: TOKEN })
  })

  it('настройка переживает перезапуск', () => {
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })

    configureConnection({ userDataDir: dir, secure: fakeSecure(true), envOverride: false })

    expect(connectionToken()).toBe(TOKEN)
    expect(connectionView().remoteUrl).toBe('https://h.example.org')
  })

  it('пустое поле токена значит «не менял», а не «стереть»', () => {
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })
    saveConnection({ mode: 'remote', remoteUrl: 'https://other.example.org' })

    expect(connectionToken()).toBe(TOKEN)
    expect(connectionView().remoteUrl).toBe('https://other.example.org')
  })

  it('стереть токен можно явно', () => {
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', clearToken: true })

    expect(connectionToken()).toBe('')
    expect(connectionView().remoteTokenSet).toBe(false)
    expect(remoteTarget(), 'без токена подключаться нечем').toBeUndefined()
  })

  it('локальный режим не отдаёт удалённой цели, но настройку помнит', () => {
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })
    saveConnection({ mode: 'local', remoteUrl: 'https://h.example.org' })

    expect(remoteTarget()).toBeUndefined()
    expect(connectionView().remoteUrl, 'вернуться обратно можно без перенабора').toBe(
      'https://h.example.org'
    )
  })
})

describe('подключение через ssh', () => {
  beforeEach(() => {
    configureConnection({ userDataDir: dir, secure: fakeSecure(true), envOverride: false })
  })

  it('настройка ssh переживает перезапуск', () => {
    saveConnection({
      mode: 'ssh',
      sshHost: 'build',
      sshUser: 'ivan',
      sshPort: 2222,
      sshKeyPath: '~/.ssh/id_build',
      sshRemoteHermesPath: '/opt/hermes'
    })

    configureConnection({ userDataDir: dir, secure: fakeSecure(true), envOverride: false })

    const view = connectionView()
    expect(view.mode).toBe('ssh')
    expect(view.sshHost).toBe('build')
    expect(view.sshPort).toBe(2222)
    expect(view.sshKeyPath).toBe('~/.ssh/id_build')
  })

  it('без живого туннеля подключаться некуда — притворяться нельзя', () => {
    saveConnection({ mode: 'ssh', sshHost: 'build' })

    expect(remoteTarget(), 'иначе запросы уйдут в закрытый порт').toBeUndefined()
  })

  it('токен для ssh не хранится: его назначает главный процесс на каждый раз', () => {
    saveConnection({ mode: 'ssh', sshHost: 'build' })

    expect(connectionToken()).toBe('')
    expect(stored()).toContain('"tokenEncoding": "none"')
  })
})

describe('машина без хранилища ключей', () => {
  beforeEach(() => {
    configureConnection({ userDataDir: dir, secure: fakeSecure(false), envOverride: false })
  })

  it('молча открытым текстом не пишем — это отказ с объяснением', () => {
    const outcome = saveConnection({
      mode: 'remote',
      remoteUrl: 'https://h.example.org',
      remoteToken: TOKEN
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toContain('отдельное согласие')
    expect(stored(), 'ничего не записано').toBe('')
  })

  it('с явным согласием — пишем, и человек это видит', () => {
    const outcome = saveConnection({
      mode: 'remote',
      remoteUrl: 'https://h.example.org',
      remoteToken: TOKEN,
      allowPlainTextToken: true
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.config.remoteTokenPlainText, 'напоминание остаётся на экране').toBe(true)
    expect(outcome.config.secureTokenStorage).toBe(false)
    expect(connectionToken()).toBe(TOKEN)
  })
})

describe('ключ ОС сменился', () => {
  it('нерасшифруемый токен — это «подключиться нечем», а не падение', () => {
    configureConnection({ userDataDir: dir, secure: fakeSecure(true), envOverride: false })
    saveConnection({ mode: 'remote', remoteUrl: 'https://h.example.org', remoteToken: TOKEN })

    configureConnection({
      userDataDir: dir,
      secure: {
        isEncryptionAvailable: () => true,
        encryptString: () => Buffer.from(''),
        decryptString: () => {
          throw new Error('ключ не тот')
        }
      },
      envOverride: false
    })

    expect(connectionToken()).toBe('')
    expect(connectionView().remoteTokenPreview).toBeNull()
  })
})
