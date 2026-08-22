// Задача 3.12 (SPEC UR20). Главное, что здесь проверяется, — что токен не может
// уехать в окно: у представления, которое туда отдаётся, поля с токеном нет
// физически. Остальное — про адрес, который печатает человек.

import { describe, expect, it } from 'vitest'

import {
  connectionReady,
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
  token: 'ZW5jcnlwdGVk'
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
      clearToken: false
    })
  })

  it('незнакомый режим — локальный', () => {
    expect(readConnectionInput({ mode: 'cloud' }).mode).toBe('local')
    expect(readConnectionInput(null).mode).toBe('local')
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
})
