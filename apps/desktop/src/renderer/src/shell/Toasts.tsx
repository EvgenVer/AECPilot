import { useEffect, type Dispatch } from 'react'
import {
  hasExpiringToasts,
  type NotificationAction,
  type NotificationState
} from './notifications-pure'

/** How often the stack checks for expired toasts. The reducer does the
 * arithmetic against a `now` supplied here, so the clock stays out of it; a
 * half-second tick is invisible to a reader and costs nothing while the stack
 * is empty (the timer only runs when something can actually expire). */
const EXPIRY_TICK_MS = 500

/** Toast stack (task 1.6.B6.6, spec: specs/workbench-panels.md §Уведомления).
 *
 * Purely presentational: the queue itself lives in Shell (`notifications-pure`)
 * because the status bar's counter and journal read the same state. What this
 * component owns is the expiry tick and the markup.
 *
 * Levels are announced, not just coloured: `error` goes out as `role="alert"`
 * (a screen reader interrupts for it), everything else as `role="status"`. */
export default function Toasts({
  state,
  dispatch
}: {
  state: NotificationState
  dispatch: Dispatch<NotificationAction>
}) {
  const ticking = hasExpiringToasts(state)

  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => dispatch({ kind: 'expire', now: Date.now() }), EXPIRY_TICK_MS)
    return () => clearInterval(timer)
  }, [ticking, dispatch])

  if (state.toasts.length === 0) return null

  return (
    <div className="toasts">
      {state.toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.level}`}
          role={toast.level === 'error' ? 'alert' : 'status'}
        >
          <span className="toast__text">{toast.text}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Закрыть уведомление"
            onClick={() => dispatch({ kind: 'dismiss', id: toast.id })}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
