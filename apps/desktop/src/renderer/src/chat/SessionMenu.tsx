import { useState } from 'react'
import type { HistoryMessage, SessionSummary } from '../../../shared/gateway/types'

/** Header session selector (task 0.14): lists existing sessions, creates a
 * new one, and switches to another one. The list is fetched lazily on each
 * open — nothing is fetched on mount — so the panel makes no `sessions:list`
 * call until the user actually opens the dropdown. */
export default function SessionMenu({
  disabled,
  currentLabel,
  onSessionLoaded,
  onError
}: {
  disabled: boolean
  currentLabel: string
  onSessionLoaded: (messages: HistoryMessage[]) => void
  onError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [busy, setBusy] = useState(false)

  async function handleToggle(): Promise<void> {
    if (disabled) return
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setLoading(true)
    setError(undefined)
    try {
      const { sessions: list } = await window.aecpilot.listSessions()
      setSessions(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleNewSession(): Promise<void> {
    setBusy(true)
    try {
      await window.aecpilot.newSession()
      onSessionLoaded([])
      setOpen(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSwitch(id: string): Promise<void> {
    setBusy(true)
    try {
      const { messages } = await window.aecpilot.switchSession(id)
      onSessionLoaded(messages)
      setOpen(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => void handleToggle()}
        disabled={disabled}
        style={{
          font: 'inherit',
          fontSize: 12,
          padding: '4px 8px',
          cursor: disabled ? 'default' : 'pointer'
        }}
      >
        {currentLabel} ▾
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            minWidth: 260,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 10,
            fontSize: 13
          }}
        >
          <button
            onClick={() => void handleNewSession()}
            disabled={busy}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 10px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #eee',
              cursor: busy ? 'default' : 'pointer',
              font: 'inherit',
              color: 'inherit'
            }}
          >
            + Новая сессия
          </button>

          {loading && <div style={{ padding: '8px 10px', opacity: 0.6 }}>Загрузка…</div>}
          {error && <div style={{ padding: '8px 10px', color: '#c33' }}>{error}</div>}

          {!loading &&
            !error &&
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => void handleSwitch(session.id)}
                disabled={busy}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid #eee',
                  cursor: busy ? 'default' : 'pointer',
                  font: 'inherit',
                  color: 'inherit'
                }}
              >
                <div>{session.title || session.preview || session.id}</div>
                <div style={{ opacity: 0.6, fontSize: 11 }}>{session.message_count} сообщ.</div>
              </button>
            ))}

          {!loading && !error && sessions.length === 0 && (
            <div style={{ padding: '8px 10px', opacity: 0.6 }}>Нет сессий</div>
          )}
        </div>
      )}
    </div>
  )
}
