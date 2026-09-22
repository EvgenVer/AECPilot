// D-98 (задача 3F.7). Проверяется одно обещание: главный процесс адресует
// ту сессию, которую окно открыло последней, — а не ту, что завёл сам.

import { describe, expect, it } from 'vitest'

import { sessionToFollow } from './session-follow-pure'

describe('за какой сессией окна идёт главный процесс', () => {
  it('создание, подъём и возобновление сессии окном — это переключение', () => {
    expect(sessionToFollow('session.create', { session_id: 'e2e-2' }, 'e2e-1')).toBe('e2e-2')
    expect(sessionToFollow('session.activate', { session_id: 'e2e-3' }, 'e2e-2')).toBe('e2e-3')
    expect(sessionToFollow('session.resume', { session_id: 'e2e-1' }, undefined)).toBe('e2e-1')
  })

  it('остальные вызовы и кривые ответы ничего не меняют', () => {
    expect(sessionToFollow('session.list', { session_id: 'e2e-9' }, 'e2e-1')).toBeNull()
    expect(sessionToFollow('prompt.submit', { session_id: 'e2e-9' }, 'e2e-1')).toBeNull()
    expect(sessionToFollow('session.create', null, 'e2e-1')).toBeNull()
    expect(sessionToFollow('session.create', { session_id: '' }, 'e2e-1')).toBeNull()
    expect(sessionToFollow('session.create', { session_id: 7 }, 'e2e-1')).toBeNull()
  })

  it('та же сессия — не переключение (эпоха не сдвигается зря)', () => {
    expect(sessionToFollow('session.resume', { session_id: 'e2e-1' }, 'e2e-1')).toBeNull()
  })
})
