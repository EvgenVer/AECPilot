// Component tests for the toast stack (task 1.6.B6.6) and the status bar's
// counter/journal (task 1.6.B6.7). Both are driven the way the shell drives
// them: a real gateway event goes through `notificationFromEvent` into the
// same reducer, so these tests break if that path changes — not only if the
// markup does.

import { useReducer, type Dispatch } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import Toasts from './Toasts'
import StatusBar from './StatusBar'
import {
  emptyNotificationState,
  notificationFromEvent,
  notificationsReducer,
  type NotificationAction
} from './notifications-pure'
import type { GatewayEvent } from '../../../shared/gateway/types'

// The status bar carries the approvals selector and the YOLO zap, both of
// which read the bridge on mount — stubbed so these tests stay about
// notifications.
beforeEach(() => {
  window.aecpilot = {
    getApprovalsMode: vi.fn().mockResolvedValue({ mode: 'manual' }),
    setYolo: vi.fn()
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function event(type: string, payload: unknown): GatewayEvent {
  return { type, payload } as GatewayEvent
}

/** Mirrors Shell's wiring: one queue, events in, both surfaces out. */
function Harness({
  onDispatch,
  withStatusBar = false
}: {
  onDispatch: (dispatch: Dispatch<NotificationAction>) => void
  withStatusBar?: boolean
}) {
  const [state, dispatch] = useReducer(notificationsReducer, emptyNotificationState)
  onDispatch(dispatch)
  return (
    <>
      <Toasts state={state} dispatch={dispatch} />
      {withStatusBar && (
        <StatusBar
          connectionState="ready"
          approvalsDisabled={false}
          onApprovalsError={() => {}}
          compacting={false}
          yolo={false}
          hasSession={false}
          notifications={state}
          notificationsDispatch={dispatch}
        />
      )}
    </>
  )
}

function mount(withStatusBar = false): {
  push: (evt: GatewayEvent, receivedAt?: number) => void
  clear: (key: string) => void
} {
  let dispatch: Dispatch<NotificationAction> | undefined
  render(<Harness onDispatch={(d) => (dispatch = d)} withStatusBar={withStatusBar} />)
  return {
    push: (evt, receivedAt = Date.now()) => {
      const input = notificationFromEvent(evt)
      if (!input) throw new Error(`not a notification: ${evt.type}`)
      act(() => dispatch?.({ kind: 'show', input, receivedAt }))
    },
    clear: (key) => act(() => dispatch?.({ kind: 'clear', key }))
  }
}

describe('Toasts', () => {
  it('shows a toast on notification.show, with the level in its role', () => {
    const { push } = mount()
    push(event('notification.show', { text: 'Кредиты закончились', level: 'error' }))

    const toast = screen.getByRole('alert')
    expect(toast.textContent).toContain('Кредиты закончились')

    push(event('notification.show', { text: 'Индекс обновлён', level: 'info' }))
    expect(screen.getByRole('status').textContent).toContain('Индекс обновлён')
  })

  it('hides a toast on its own once ttl_ms has passed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0))
    const { push } = mount()
    push(event('notification.show', { text: 'Ненадолго', kind: 'ttl', ttl_ms: 2000 }))
    expect(screen.getByRole('status')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps a sticky toast even though the notice carried a ttl_ms', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 3, 12, 0, 0))
    const { push } = mount()
    push(event('notification.show', { text: 'До закрытия', kind: 'sticky', ttl_ms: 1000 }))

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('status').textContent).toContain('До закрытия')
  })

  it('removes a toast when the core withdraws it by key', () => {
    const { push, clear } = mount()
    push(event('notification.show', { text: 'Кредиты', key: 'credits' }))
    expect(screen.getByRole('status')).toBeTruthy()

    clear('credits')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('closes one toast by hand and leaves the others alone', () => {
    const { push } = mount()
    push(event('notification.show', { text: 'первое' }))
    push(event('notification.show', { text: 'второе' }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть уведомление' })[0])

    const texts = screen.getAllByRole('status').map((node) => node.textContent)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('второе')
  })
})

describe('StatusBar notifications counter and journal', () => {
  it('counts new notifications and zeroes the counter when the journal opens', () => {
    const { push } = mount(true)
    push(event('notification.show', { text: 'раз' }))
    push(event('status.update', { kind: 'process', text: 'npm test завершён' }))

    expect(screen.getByLabelText('непрочитанных: 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Уведомления/ }))
    expect(screen.queryByLabelText(/непрочитанных/)).toBeNull()
  })

  it('keeps a closed toast in the journal', () => {
    const { push } = mount(true)
    push(event('notification.show', { text: 'уже закрыто' }))
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }))
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Уведомления/ }))
    const journal = screen.getByRole('dialog', { name: 'Журнал уведомлений' })
    expect(journal.textContent).toContain('уже закрыто')
  })

  it('explains an empty journal instead of showing a blank panel', () => {
    mount(true)
    fireEvent.click(screen.getByRole('button', { name: /Уведомления/ }))
    expect(screen.getByText('Уведомлений пока не было.')).toBeTruthy()
  })
})
