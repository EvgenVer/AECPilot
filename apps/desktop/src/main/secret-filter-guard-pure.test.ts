import { describe, expect, it } from 'vitest'

import {
  FILTER_STATUS_COMMAND,
  FILTER_STATUS_LOADED,
  filterLoaded,
  startsTurn,
  turnSessionId
} from './secret-filter-guard-pure'

describe('сторож фильтра секретов (T20.10)', () => {
  it('ходы модели проверяются, служебные запросы — нет', () => {
    for (const method of ['prompt.submit', 'prompt.background', 'prompt.btw']) {
      expect(startsTurn(method, { session_id: 's' }), method).toBe(true)
    }
    for (const method of ['session.create', 'session.list', 'session.interrupt', 'config.get']) {
      expect(startsTurn(method, { session_id: 's' }), method).toBe(false)
    }
  })

  it('команда может начать ход (/goal) — проверяется; сама команда состояния — нет', () => {
    expect(startsTurn('command.dispatch', { name: 'goal', arg: 'сверить разделы' })).toBe(true)
    expect(startsTurn('command.dispatch', { name: FILTER_STATUS_COMMAND })).toBe(false)
  })

  it('загружен — только точный ответ команды', () => {
    expect(filterLoaded({ type: 'exec', output: FILTER_STATUS_LOADED })).toBe(true)
    expect(filterLoaded({ output: `${FILTER_STATUS_LOADED}\n` })).toBe(true)
    expect(filterLoaded({ output: 'Unknown command: /aec-filter-status' })).toBe(false)
    expect(filterLoaded({ output: '' })).toBe(false)
    expect(filterLoaded(null)).toBe(false)
    expect(filterLoaded(undefined)).toBe(false)
  })

  it('сессия берётся из запроса', () => {
    expect(turnSessionId({ session_id: 'abc' })).toBe('abc')
    expect(turnSessionId({ session_id: '' })).toBeNull()
    expect(turnSessionId({})).toBeNull()
    expect(turnSessionId(null)).toBeNull()
  })
})
