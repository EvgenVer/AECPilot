// Unit tests for the notification queue (tasks 1.6.B6.4, B6.5, B6.10).
// Every rule here comes from specs/workbench-panels.md §Уведомления, and the
// ones about the gateway's own shape are marked with the donor line they were
// read from.

import { describe, expect, it } from 'vitest'
import {
  emptyNotificationState,
  hasExpiringToasts,
  MAX_JOURNAL,
  MAX_TOASTS,
  notificationFromEvent,
  notificationsReducer,
  PROCESS_NOTICE_TTL_MS,
  ttlFromNotice,
  type NotificationInput,
  type NotificationState
} from './notifications-pure'
import type { GatewayEvent } from '../../../shared/gateway/types'

function show(
  state: NotificationState,
  input: NotificationInput,
  receivedAt = 1000
): NotificationState {
  return notificationsReducer(state, { kind: 'show', input, receivedAt })
}

describe('notification queue', () => {
  it('adds a notification to both the toast stack and the journal', () => {
    const state = show(emptyNotificationState, { text: 'Готово', level: 'success' })

    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].text).toBe('Готово')
    expect(state.toasts[0].level).toBe('success')
    expect(state.journal).toHaveLength(1)
    expect(state.unread).toBe(1)
  })

  it('defaults an unknown level to info rather than dropping the notice', () => {
    const state = show(emptyNotificationState, { text: 'что-то' })
    expect(state.toasts[0].level).toBe('info')
  })

  it('replaces, not duplicates, a repeat show with the same key', () => {
    let state = show(emptyNotificationState, { text: 'Осталось 3', key: 'credits' })
    state = show(state, { text: 'Осталось 2', key: 'credits' }, 2000)

    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].text).toBe('Осталось 2')
    expect(state.journal).toHaveLength(1)
    // A self-updating notice must not inflate the unread counter.
    expect(state.unread).toBe(1)
  })

  it('keeps a replaced notice in its place instead of moving it to the front', () => {
    let state = show(emptyNotificationState, { text: 'первое', key: 'a' })
    state = show(state, { text: 'второе', key: 'b' }, 1100)
    state = show(state, { text: 'первое, обновлённое', key: 'a' }, 1200)

    expect(state.toasts.map((item) => item.text)).toEqual(['первое, обновлённое', 'второе'])
  })

  it('keeps two keyless notices apart', () => {
    let state = show(emptyNotificationState, { text: 'один и тот же текст' })
    state = show(state, { text: 'один и тот же текст' }, 2000)

    expect(state.toasts).toHaveLength(2)
    expect(state.unread).toBe(2)
  })

  it('clears a toast by key and leaves it in the journal', () => {
    let state = show(emptyNotificationState, { text: 'Кредиты', key: 'credits' })
    state = notificationsReducer(state, { kind: 'clear', key: 'credits' })

    expect(state.toasts).toHaveLength(0)
    expect(state.journal).toHaveLength(1)
  })

  it('treats clear for an unknown key as a no-op, returning the same state', () => {
    const state = show(emptyNotificationState, { text: 'Кредиты', key: 'credits' })
    const after = notificationsReducer(state, { kind: 'clear', key: 'never-shown' })

    expect(after).toBe(state)
  })

  it('dismisses one toast by id without touching the journal or the others', () => {
    let state = show(emptyNotificationState, { text: 'первое' })
    state = show(state, { text: 'второе' }, 2000)
    const first = state.toasts[0]
    state = notificationsReducer(state, { kind: 'dismiss', id: first.id })

    expect(state.toasts.map((item) => item.text)).toEqual(['второе'])
    expect(state.journal).toHaveLength(2)
  })

  it('expires a toast once its ttl has run out', () => {
    let state = show(emptyNotificationState, { text: 'ненадолго', ttlMs: 5000 }, 1000)
    state = notificationsReducer(state, { kind: 'expire', now: 5999 })
    expect(state.toasts).toHaveLength(1)

    state = notificationsReducer(state, { kind: 'expire', now: 6000 })
    expect(state.toasts).toHaveLength(0)
    expect(state.journal).toHaveLength(1)
  })

  it('keeps a notice without ttl until it is closed by hand', () => {
    let state = show(emptyNotificationState, { text: 'до последнего' }, 1000)
    state = notificationsReducer(state, { kind: 'expire', now: 10 ** 9 })

    expect(state.toasts).toHaveLength(1)
    expect(hasExpiringToasts(state)).toBe(false)

    state = notificationsReducer(state, { kind: 'dismiss', id: state.toasts[0].id })
    expect(state.toasts).toHaveLength(0)
  })

  it('caps the toast stack, dropping the oldest and keeping all of them in the journal', () => {
    let state = emptyNotificationState
    for (let index = 0; index < MAX_TOASTS + 2; index += 1) {
      state = show(state, { text: `#${index}` }, 1000 + index)
    }

    expect(state.toasts).toHaveLength(MAX_TOASTS)
    expect(state.toasts[0].text).toBe('#2')
    expect(state.journal).toHaveLength(MAX_TOASTS + 2)
  })

  it('caps the journal length', () => {
    let state = emptyNotificationState
    for (let index = 0; index < MAX_JOURNAL + 5; index += 1) {
      state = show(state, { text: `#${index}` }, 1000 + index)
    }

    expect(state.journal).toHaveLength(MAX_JOURNAL)
    // Newest first, so the survivors are the last ones in.
    expect(state.journal[0].text).toBe(`#${MAX_JOURNAL + 4}`)
  })

  it('zeroes the unread counter when the journal is opened', () => {
    let state = show(emptyNotificationState, { text: 'раз' })
    state = show(state, { text: 'два' }, 2000)
    expect(state.unread).toBe(2)

    state = notificationsReducer(state, { kind: 'journal-opened' })
    expect(state.unread).toBe(0)
    // Opening the journal is not dismissing the toasts.
    expect(state.toasts).toHaveLength(2)
  })
})

describe('gateway events → notifications', () => {
  function event(type: string, payload: unknown): GatewayEvent {
    return { type, payload } as GatewayEvent
  }

  it('turns notification.show into a notification with its level and key', () => {
    const input = notificationFromEvent(
      event('notification.show', {
        text: 'Кредиты закончились',
        level: 'error',
        kind: 'ttl',
        ttl_ms: 4000,
        key: 'credits'
      })
    )

    expect(input).toEqual({
      text: 'Кредиты закончились',
      level: 'error',
      ttlMs: 4000,
      key: 'credits'
    })
  })

  // agent/credits_tracker.py:178 — "honored only when kind == ttl".
  it('ignores ttl_ms on a sticky notice', () => {
    expect(ttlFromNotice('sticky', 4000)).toBeUndefined()
    expect(ttlFromNotice('ttl', 4000)).toBe(4000)
    expect(ttlFromNotice('ttl', 0)).toBeUndefined()
    expect(ttlFromNotice(undefined, 4000)).toBeUndefined()
  })

  it('drops a notification.show with empty text', () => {
    expect(notificationFromEvent(event('notification.show', { text: '   ' }))).toBeUndefined()
  })

  // Task 1.6.B6.4 — their notification poller, server.py::_notification_poller_loop.
  it('turns status.update {kind:"process"} into a notification with a ttl', () => {
    const input = notificationFromEvent(
      event('status.update', { kind: 'process', text: 'npm test завершён (код 0)' })
    )

    expect(input).toEqual({
      text: 'npm test завершён (код 0)',
      level: 'info',
      ttlMs: PROCESS_NOTICE_TTL_MS
    })
  })

  // Task 1.6.B6.4. `goal` is listed here as the task named it, but hermes
  // 0.19.0 emits no such kind at all (specs/workbench-panels.md fact 9) — the
  // goal badge asks `command.dispatch {name:'goal'}` instead. The other three
  // kinds belong to the compaction indicator (task 1.6.B5.14), not here.
  it('produces no notification for any other status kind, goal included', () => {
    for (const kind of ['goal', 'compressing', 'compacting', 'status', 'lifecycle', 'warn']) {
      expect(
        notificationFromEvent(event('status.update', { kind, text: 'что-то' }))
      ).toBeUndefined()
    }
  })

  // Task 1.6.B6.10 — server.py's `browser` RPC sends {message, level} and no tool id.
  it('turns browser.progress into a keyed toast so lines replace each other', () => {
    const first = notificationFromEvent(
      event('browser.progress', { message: 'Ищу Chrome', level: 'info' })
    )
    const second = notificationFromEvent(
      event('browser.progress', { message: 'Подключился', level: 'info' })
    )

    expect(first?.key).toBe('browser.progress')
    expect(second?.key).toBe('browser.progress')

    let state = show(emptyNotificationState, first as NotificationInput)
    state = show(state, second as NotificationInput, 2000)
    expect(state.toasts).toHaveLength(1)
    expect(state.toasts[0].text).toBe('Подключился')
  })

  it('ignores events that are not notifications', () => {
    expect(notificationFromEvent(event('message.delta', { text: 'привет' }))).toBeUndefined()
    expect(notificationFromEvent(event('tool.start', { tool_id: 't1' }))).toBeUndefined()
  })
})
