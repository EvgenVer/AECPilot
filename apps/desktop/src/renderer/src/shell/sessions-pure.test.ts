// Tasks 1.6.B5.3–B5.5 — the rules behind the sessions list that are worth
// pinning without a DOM: what a session is called, what the search covers (and
// what it deliberately does not), and what the delete confirmation promises.

import { describe, expect, it } from 'vitest'
import {
  applySessionTitle,
  describeDeleteError,
  describeLiveStatus,
  describeSessionDeletion,
  filterSessions,
  formatMessageCount,
  formatStartedAt,
  liveKeys,
  sessionLabel,
  SEARCH_EMPTY_HINT
} from './sessions-pure'

describe('sessionLabel', () => {
  it('prefers the title', () => {
    expect(sessionLabel({ id: 'abc', title: 'Смета', preview: 'посчитай' })).toBe('Смета')
  })

  it('falls back to the preview while the gateway has not titled it yet', () => {
    expect(sessionLabel({ id: 'abc', title: '  ', preview: 'посчитай смету' })).toBe(
      'посчитай смету'
    )
  })

  it('falls back to the id rather than showing an empty row', () => {
    expect(sessionLabel({ id: 'abc', title: '', preview: '' })).toBe('abc')
  })
})

describe('filterSessions', () => {
  const sessions = [
    { id: '1', title: 'Смета на фундамент', preview: 'посчитай объём бетона' },
    { id: '2', title: '', preview: 'ГОСТ на арматуру' },
    { id: '3', title: 'Отчёт', preview: '' }
  ]

  it('matches the title case-insensitively', () => {
    expect(filterSessions(sessions, 'СМЕТА').map((s) => s.id)).toEqual(['1'])
  })

  it('matches the preview too', () => {
    expect(filterSessions(sessions, 'арматур').map((s) => s.id)).toEqual(['2'])
  })

  it('returns everything for a blank query', () => {
    expect(filterSessions(sessions, '   ')).toHaveLength(3)
  })

  it('says what it searched instead of "nothing found"', () => {
    expect(filterSessions(sessions, 'бетона в подвале')).toHaveLength(0)
    // The hint has to name both covered fields AND the uncovered one — an
    // empty result otherwise reads as "this conversation does not exist".
    expect(SEARCH_EMPTY_HINT).toContain('превью')
    expect(SEARCH_EMPTY_HINT).toContain('по тексту переписки ядро не умеет')
  })
})

describe('formatMessageCount', () => {
  it('declines the noun', () => {
    expect(formatMessageCount(1)).toBe('1 сообщение')
    expect(formatMessageCount(3)).toBe('3 сообщения')
    expect(formatMessageCount(7)).toBe('7 сообщений')
  })

  it('handles the teens, where the last digit lies', () => {
    expect(formatMessageCount(11)).toBe('11 сообщений')
    expect(formatMessageCount(12)).toBe('12 сообщений')
    expect(formatMessageCount(21)).toBe('21 сообщение')
  })

  it('treats a missing count as zero', () => {
    expect(formatMessageCount(undefined)).toBe('0 сообщений')
  })
})

describe('formatStartedAt', () => {
  it('formats in local time', () => {
    const stamp = new Date(2026, 6, 31, 1, 5).getTime() / 1000
    expect(formatStartedAt(stamp)).toBe('31.07.2026 01:05')
  })

  it('shows nothing rather than 1970 for a missing timestamp', () => {
    expect(formatStartedAt(undefined)).toBe('')
    expect(formatStartedAt(0)).toBe('')
  })
})

describe('liveKeys', () => {
  it('keys live sessions by their STORED id, not their live sid', () => {
    const keys = liveKeys([
      { session_key: 'stored-1', id: 'live-1' },
      { session_key: 'stored-2', id: 'live-2' }
    ] as never)
    // The stored id is what a session.list row carries — matching on `id`
    // would never hit and every live session would look deletable.
    expect(keys.has('stored-1')).toBe(true)
    expect(keys.has('live-1')).toBe(false)
  })

  it('treats a missing list as nothing live', () => {
    expect(liveKeys(undefined).size).toBe(0)
  })
})

describe('applySessionTitle', () => {
  const sessions = [
    { id: 'stored-1', title: 'Смета' },
    { id: 'stored-2', title: 'Отчёт' }
  ]

  it('renames exactly the row the payload names, and only it', () => {
    const next = applySessionTitle(sessions, { session_id: 'stored-2', title: 'Отчёт по ГОСТ' })
    expect(next.map((s) => s.title)).toEqual(['Смета', 'Отчёт по ГОСТ'])
  })

  it('ignores an event for a session this list does not hold', () => {
    // Identity is preserved on purpose: a title pushed for another window's
    // session must not cost a re-render here.
    expect(applySessionTitle(sessions, { session_id: 'stored-9', title: 'X' })).toBe(sessions)
  })

  it('ignores an empty title', () => {
    expect(applySessionTitle(sessions, { session_id: 'stored-1', title: '  ' })).toBe(sessions)
  })

  it('ignores a payload with no id at all', () => {
    expect(applySessionTitle(sessions, undefined)).toBe(sessions)
  })
})

describe('describeSessionDeletion', () => {
  it('names both things the gateway removes', () => {
    const text = describeSessionDeletion('Смета')
    expect(text).toContain('Смета')
    expect(text).toContain('транскрипта')
    expect(text).toContain('вернуть')
  })
})

describe('describeDeleteError', () => {
  it('explains 4023 as a rule rather than a fault', () => {
    expect(describeDeleteError('4023: cannot delete an active session')).toContain(
      'сейчас открыта в ядре'
    )
  })

  it('passes an unfamiliar failure through unchanged', () => {
    expect(describeDeleteError('database is locked')).toBe('database is locked')
  })
})

describe('describeLiveStatus', () => {
  it('translates the statuses it knows', () => {
    expect(describeLiveStatus('streaming')).toBe('отвечает')
    expect(describeLiveStatus('idle')).toBe('ждёт')
  })

  it('shows an unfamiliar status as-is instead of hiding it', () => {
    expect(describeLiveStatus('reconnecting')).toBe('reconnecting')
  })
})
