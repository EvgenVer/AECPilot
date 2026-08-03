import { useState, type Dispatch } from 'react'
import ApprovalsModeSelect from '../chat/ApprovalsModeSelect'
import YoloToggle from './YoloToggle'
import type { NotificationAction, NotificationState } from './notifications-pure'
import type { GatewayConnectionState } from '../../../shared/gateway/types'

const CONNECTION_LABEL: Record<GatewayConnectionState, string> = {
  connecting: 'Подключение…',
  ready: 'Подключено',
  reconnecting: 'Переподключение…',
  closed: 'Отключено'
}

function dotClassName(state: GatewayConnectionState): string {
  if (state === 'ready') return 'statusbar__dot'
  if (state === 'closed') return 'statusbar__dot statusbar__dot--off'
  return 'statusbar__dot statusbar__dot--pending'
}

/** Status bar (task 1.0): the only functionally-live indicators are the
 * gateway connection state and the approvals mode (moved here from the chat
 * header per the approved design) — model/index/changes counters are
 * deferred to the phases that actually wire them (Phase 2+), so they are
 * intentionally omitted rather than faked. */
export default function StatusBar({
  connectionState,
  approvalsDisabled,
  onApprovalsError,
  compacting,
  yolo,
  hasSession,
  notifications,
  notificationsDispatch
}: {
  connectionState: GatewayConnectionState
  approvalsDisabled: boolean
  onApprovalsError: (message: string) => void
  /** The core is compressing the context (task 1.6.B5.14) — manually or on its
   * own mid-turn. Without this the agent looks stalled: nothing streams while
   * a compaction runs. */
  compacting: boolean
  /** Approval bypass of the CURRENT session, as `session.info` reports it
   * (task 1.6.B5.21). */
  yolo: boolean
  /** A live session exists — see `YoloToggle` for why the zap must not be
   * pressable without one. */
  hasSession: boolean
  /** Notification queue (task 1.6.B6.7). The counter and the journal read the
   * same state the toasts do — a toast that expired on its own is still in the
   * journal, which is the whole point of having one. */
  notifications: NotificationState
  notificationsDispatch: Dispatch<NotificationAction>
}) {
  const [journalOpen, setJournalOpen] = useState(false)

  function toggleJournal(): void {
    const next = !journalOpen
    setJournalOpen(next)
    // Unread zeroes on OPEN, not on a toast disappearing: a notice nobody
    // looked at has not been read just because its ttl ran out.
    if (next) notificationsDispatch({ kind: 'journal-opened' })
  }

  return (
    <div className="statusbar">
      <div className="statusbar__item">
        <span className={dotClassName(connectionState)} />
        {CONNECTION_LABEL[connectionState]}
      </div>
      {compacting && (
        <>
          <div className="statusbar__sep" />
          <div className="statusbar__item" role="status">
            <span className="statusbar__dot statusbar__dot--pending" />
            Сжимаю контекст…
          </div>
        </>
      )}
      <div className="statusbar__sep" />
      <div className="statusbar__item">
        {/* Two different settings side by side, and deliberately so: the
            selector owns the PERSISTENT approvals mode (task 0.17, three
            modes including "умный"), the zap owns THIS session only. Their
            global-scope zap would have collapsed both into two states. */}
        <ApprovalsModeSelect disabled={approvalsDisabled} onError={onApprovalsError} />
      </div>
      <div className="statusbar__sep" />
      <div className="statusbar__item">
        <YoloToggle yolo={yolo} hasSession={hasSession} onError={onApprovalsError} />
      </div>
      <div className="statusbar__spacer" />
      <div className="statusbar__item">
        <button
          type="button"
          className="statusbar__notifications"
          aria-expanded={journalOpen}
          onClick={toggleJournal}
          title="Журнал уведомлений"
        >
          Уведомления
          {notifications.unread > 0 && (
            <span
              className="statusbar__badge"
              aria-label={`непрочитанных: ${notifications.unread}`}
            >
              {notifications.unread}
            </span>
          )}
        </button>
      </div>
      <div className="statusbar__sep" />
      <div className="statusbar__item" title="Язык интерфейса (en/ru — Phase 4)">
        RU
      </div>
      {journalOpen && (
        <div className="notification-journal" role="dialog" aria-label="Журнал уведомлений">
          <div className="notification-journal__head">
            Журнал уведомлений
            <button
              type="button"
              className="scan-notification__close"
              aria-label="Закрыть журнал"
              onClick={() => setJournalOpen(false)}
            >
              ×
            </button>
          </div>
          {notifications.journal.length === 0 ? (
            <div className="notification-journal__empty">Уведомлений пока не было.</div>
          ) : (
            <ul className="notification-journal__list">
              {notifications.journal.map((item) => (
                <li
                  key={item.id}
                  className={`notification-journal__row notification-journal__row--${item.level}`}
                >
                  {item.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
