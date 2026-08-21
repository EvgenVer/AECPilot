// Задача 3.8 (SPEC UR23). Проверяется граница гейта: что считается установкой,
// что ей не является, и правда ли из скила достаётся список инструментов.

import { describe, expect, it } from 'vitest'

import { envKeysOf, installBeingRequested, requiredToolsOf } from './install-consent-pure'

describe('что считается установкой', () => {
  it('скил из хаба', () => {
    expect(
      installBeingRequested({
        method: 'POST',
        path: '/api/skills/hub/install',
        body: { identifier: 'nous/pdf-tools' }
      })
    ).toEqual({ kind: 'skill', label: 'nous/pdf-tools' })
  })

  it('обновление всех скилов — тоже установка: код приезжает заново', () => {
    expect(
      installBeingRequested({ method: 'POST', path: '/api/skills/hub/update', body: {} })
    ).toEqual({ kind: 'skill-update', label: '' })
  })

  it('сервер из каталога', () => {
    expect(
      installBeingRequested({
        method: 'POST',
        path: '/api/mcp/catalog/install',
        body: { name: 'filesystem', env: { API_KEY: 'sk-secret' }, enable: true }
      })
    ).toEqual({ kind: 'mcp-catalog', label: 'filesystem', envKeys: ['API_KEY'] })
  })

  it('сервер, заданный командой, приносит с собой команду запуска', () => {
    expect(
      installBeingRequested({
        method: 'POST',
        path: '/api/mcp/servers',
        body: { name: 'local', command: 'node', args: ['server.js', '--port', '3000'] }
      })
    ).toEqual({ kind: 'mcp-server', label: 'local', command: 'node server.js --port 3000' })
  })

  it('строка запроса в пути не мешает', () => {
    expect(
      installBeingRequested({
        method: 'POST',
        path: '/api/skills/hub/install?profile=work',
        body: { identifier: 'x' }
      })?.kind
    ).toBe('skill')
  })
})

describe('что установкой НЕ является', () => {
  it('чтение каталога и поиск', () => {
    expect(installBeingRequested({ path: '/api/mcp/catalog' })).toBeNull()
    expect(installBeingRequested({ path: '/api/skills/hub/search?q=pdf' })).toBeNull()
    expect(installBeingRequested({ path: '/api/skills/hub/preview?identifier=x' })).toBeNull()
  })

  it('удаление и выключение — движение в сторону меньших прав', () => {
    expect(installBeingRequested({ method: 'POST', path: '/api/skills/hub/uninstall' })).toBeNull()
    expect(installBeingRequested({ method: 'DELETE', path: '/api/mcp/servers/local' })).toBeNull()
    expect(
      installBeingRequested({ method: 'PUT', path: '/api/mcp/servers/local/enabled' })
    ).toBeNull()
  })

  it('чужие пути', () => {
    expect(installBeingRequested({ method: 'POST', path: '/api/cron/jobs' })).toBeNull()
  })
})

describe('какие инструменты требует скил (UR23)', () => {
  it('строкой через запятую', () => {
    const md = [
      '---',
      'name: pdf',
      'allowed-tools: read_file, bash, web_search',
      '---',
      '# PDF'
    ].join('\n')
    expect(requiredToolsOf(md)).toEqual(['read_file', 'bash', 'web_search'])
  })

  it('списком', () => {
    const md = ['---', 'allowed-tools:', '  - read_file', '  - bash', '---', 'text'].join('\n')
    expect(requiredToolsOf(md)).toEqual(['read_file', 'bash'])
  })

  it('в квадратных скобках и кавычках', () => {
    const md = ['---', 'allowed-tools: ["read_file", \'bash\']', '---'].join('\n')
    expect(requiredToolsOf(md)).toEqual(['read_file', 'bash'])
  })

  it('поля нет — пустой список, а не выдумка', () => {
    expect(requiredToolsOf(['---', 'name: x', '---', 'text'].join('\n'))).toEqual([])
  })

  it('фронт-маттера нет вовсе', () => {
    expect(requiredToolsOf('# просто текст')).toEqual([])
    expect(requiredToolsOf(undefined)).toEqual([])
  })

  it('CRLF не ломает разбор — файл мог прийти из репозитория Windows', () => {
    const md = '---\r\nallowed-tools: bash\r\n---\r\n# x'
    expect(requiredToolsOf(md)).toEqual(['bash'])
  })
})

describe('переменные окружения сервера', () => {
  it('только имена, значения не показываются', () => {
    expect(envKeysOf({ API_KEY: 'sk-secret', HOME: '/tmp' })).toEqual(['API_KEY', 'HOME'])
  })

  it('мусор — пустой список', () => {
    expect(envKeysOf(null)).toEqual([])
    expect(envKeysOf(['a'])).toEqual([])
  })
})
