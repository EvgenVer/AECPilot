// Задача 3.12 (SPEC UR20). Главное, что здесь проверяется, — что токен не может
// уехать в окно: у представления, которое туда отдаётся, поля с токеном нет
// физически. Остальное — про адрес, который печатает человек.

import { describe, expect, it } from 'vitest'

import {
  connectionReady,
  NO_SSH,
  DEFAULT_CONNECTION,
  normalizeRemoteUrl,
  parseStoredConnection,
  publicConfig,
  readConnectionInput,
  serializeStoredConnection,
  tokenPreview,
  wsUrlFor,
  type StoredConnection
} from './connection-pure'

const REMOTE: StoredConnection = {
  mode: 'remote',
  remoteUrl: 'https://hermes.example.org',
  tokenEncoding: 'safe',
  token: 'ZW5jcnlwdGVk',
  remoteProfile: 'work',
  ssh: { ...NO_SSH }
}

describe('токен не пересекает границу окна', () => {
  it('в том, что отдаётся окну, поля с токеном нет вовсе', () => {
    const view = publicConfig(REMOTE, {
      secureAvailable: true,
      envOverride: false,
      plainToken: 'super-secret-token-value'
    })

    expect(JSON.stringify(view)).not.toContain('super-secret-token-value')
    expect(JSON.stringify(view)).not.toContain('ZW5jcnlwdGVk')
    expect('token' in view).toBe(false)
    expect('remoteToken' in view).toBe(false)
  })

  it('вместо токена — признак и четыре последних знака', () => {
    const view = publicConfig(REMOTE, {
      secureAvailable: true,
      envOverride: false,
      plainToken: 'abcdefghijklmnop'
    })

    expect(view.remoteTokenSet).toBe(true)
    expect(view.remoteTokenPreview).toBe('••••mnop')
  })

  it('короткий токен не показывается вовсе — четыре знака были бы почти всем', () => {
    expect(tokenPreview('abc123')).toBe('••••')
    expect(tokenPreview('')).toBeNull()
  })

  it('открытое хранение видно человеку, а не забывается', () => {
    const view = publicConfig(
      { ...REMOTE, tokenEncoding: 'plain' },
      { secureAvailable: false, envOverride: false, plainToken: 'plaintext-token-1234' }
    )

    expect(view.remoteTokenPlainText).toBe(true)
    expect(view.secureTokenStorage).toBe(false)
  })
})

describe('адрес удалённого ядра', () => {
  it('оставляет схему, хост и порт', () => {
    expect(normalizeRemoteUrl('https://hermes.example.org')).toBe('https://hermes.example.org')
    expect(normalizeRemoteUrl('http://10.0.0.5:8765')).toBe('http://10.0.0.5:8765')
  })

  it('путь, запрос и хвост отбрасываются — вместе с токеном, вставленным в адрес', () => {
    expect(normalizeRemoteUrl('https://h.example.org/api/ws?token=secret#x')).toBe(
      'https://h.example.org'
    )
  })

  it('чужие схемы не годятся', () => {
    expect(normalizeRemoteUrl('file:///etc/passwd')).toBe('')
    expect(normalizeRemoteUrl('javascript:alert(1)')).toBe('')
    expect(normalizeRemoteUrl('ws://h.example.org')).toBe('')
  })

  it('мусор — пустая строка, а не падение экрана', () => {
    expect(normalizeRemoteUrl('просто текст')).toBe('')
    expect(normalizeRemoteUrl('')).toBe('')
    expect(normalizeRemoteUrl(undefined)).toBe('')
  })
})

describe('адрес сокета', () => {
  it('по TLS сокет тоже по TLS — иначе токен уедет открытым', () => {
    expect(wsUrlFor('https://h.example.org', 't')).toBe('wss://h.example.org/api/ws?token=t')
    expect(wsUrlFor('http://127.0.0.1:8765', 't')).toBe('ws://127.0.0.1:8765/api/ws?token=t')
  })

  it('токен кодируется — в нём бывают знаки, ломающие запрос', () => {
    expect(wsUrlFor('https://h.example.org', 'a b&c')).toContain('token=a%20b%26c')
  })

  it('без адреса — пусто', () => {
    expect(wsUrlFor('', 't')).toBe('')
  })
})

describe('запрос от окна', () => {
  it('разбирается по полям, а не берётся на веру', () => {
    expect(
      readConnectionInput({
        mode: 'remote',
        remoteUrl: ' https://h.example.org/ ',
        remoteToken: '  tok  ',
        allowPlainTextToken: true
      })
    ).toEqual({
      mode: 'remote',
      remoteUrl: 'https://h.example.org',
      remoteToken: 'tok',
      allowPlainTextToken: true,
      clearToken: false,
      ssh: {}
    })
  })

  it('чего в запросе не было — то не менялось', () => {
    const input = readConnectionInput({ mode: 'local' })

    expect(input.remoteUrl, 'иначе переключение режима стирало бы адрес').toBeUndefined()
    expect(input.ssh).toEqual({})
  })

  it('незнакомый режим — локальный', () => {
    expect(readConnectionInput({ mode: 'cloud' }).mode, 'облака у нас нет').toBe('local')
    expect(readConnectionInput(null).mode).toBe('local')
  })

  it('поля ssh разбираются и доезжают до окна', () => {
    const input = readConnectionInput({
      mode: 'ssh',
      sshHost: ' build ',
      sshUser: 'ivan',
      sshPort: 2222,
      sshKeyPath: '~/.ssh/id_build',
      sshRemoteHermesPath: '/opt/hermes',
      sshRemoteProfile: '/srv/h'
    })

    expect(input.mode).toBe('ssh')
    expect(input.ssh).toEqual({
      host: 'build',
      user: 'ivan',
      port: 2222,
      keyPath: '~/.ssh/id_build',
      remoteHermesPath: '/opt/hermes',
      remoteProfile: '/srv/h'
    })
  })

  it('путь к ключу — это путь, и окну он виден: секрет не он, а ключ', () => {
    const view = publicConfig(
      { ...REMOTE, mode: 'ssh', ssh: { ...NO_SSH, host: 'build', keyPath: '~/.ssh/id_build' } },
      { secureAvailable: true, envOverride: false, plainToken: '' }
    )

    expect(view.sshHost).toBe('build')
    expect(view.sshKeyPath).toBe('~/.ssh/id_build')
  })
})

describe('хранение между запусками', () => {
  it('записанное читается обратно', () => {
    expect(parseStoredConnection(serializeStoredConnection(REMOTE))).toEqual(REMOTE)
  })

  it('испорченный файл — локальный режим, а не удалённый без адреса', () => {
    expect(parseStoredConnection('{')).toEqual(DEFAULT_CONNECTION)
    expect(parseStoredConnection('null')).toEqual(DEFAULT_CONNECTION)
  })

  it('чужая схема в сохранённом адресе не переживает чтения', () => {
    const parsed = parseStoredConnection('{"mode":"remote","remoteUrl":"file:///x"}')
    expect(parsed.remoteUrl).toBe('')
  })
})

describe('готовность к подключению', () => {
  it('локальный режим готов всегда', () => {
    expect(connectionReady(DEFAULT_CONNECTION)).toBe(true)
  })

  it('удалённый — только с адресом и токеном', () => {
    expect(connectionReady(REMOTE)).toBe(true)
    expect(connectionReady({ ...REMOTE, token: '', tokenEncoding: 'none' })).toBe(false)
    expect(connectionReady({ ...REMOTE, remoteUrl: '' })).toBe(false)
  })

  it('ssh — с именем машины: токен там наш, хранить его незачем', () => {
    const ssh: StoredConnection = {
      ...DEFAULT_CONNECTION,
      mode: 'ssh',
      ssh: { ...NO_SSH, host: 'build' }
    }

    expect(connectionReady(ssh)).toBe(true)
    expect(connectionReady({ ...ssh, ssh: { ...NO_SSH } })).toBe(false)
  })
})

describe('профиль — поле подключения (T35, SPEC N16)', () => {
  it('сохраняется, читается обратно и виден окну', () => {
    const back = parseStoredConnection(serializeStoredConnection(REMOTE))
    expect(back.remoteProfile).toBe('work')
    const view = publicConfig(back, { secureAvailable: true, envOverride: false, plainToken: 't' })
    expect(view.remoteProfile).toBe('work')
  })

  it('не присланный профиль — «не менять», присланный пустой — профиль запуска', () => {
    expect(readConnectionInput({ mode: 'remote' }).remoteProfile).toBeUndefined()
    expect(readConnectionInput({ mode: 'remote', remoteProfile: '  ' }).remoteProfile).toBe('')
  })

  it('старый файл без профиля читается с пустым профилем', () => {
    const legacy = JSON.stringify({
      mode: 'remote',
      remoteUrl: 'https://h.example',
      tokenEncoding: 'safe',
      token: 'x'
    })
    expect(parseStoredConnection(legacy).remoteProfile).toBe('')
  })
})
