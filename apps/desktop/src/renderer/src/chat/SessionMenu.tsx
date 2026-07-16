import { useEffect, useRef, useState } from 'react'
import type { HistoryMessage, SessionSummary } from '../../../shared/gateway/types'
import { ChevronDownIcon } from '../shell/icons'

/** Header session selector (task 0.14): lists existing sessions, creates a
 * new one, and switches to another one. The list is fetched lazily on each
 * open — nothing is fetched on mount — so the panel makes no `sessions:list`
 * call until the user actually opens the dropdown. Closes on an outside
 * click (task 1.0 nit, 0.14 review). */
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
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

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
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="session-trigger"
        onClick={() => void handleToggle()}
        disabled={disabled}
      >
        <span className="session-trigger__label">{currentLabel}</span>
        <ChevronDownIcon width={12} height={12} />
      </button>

      {open && (
        <div className="session-dropdown">
          <button
            type="button"
            className="session-dropdown__item"
            onClick={() => void handleNewSession()}
            disabled={busy}
          >
            + Новая сессия
          </button>

          {loading && <div className="session-dropdown__status">Загрузка…</div>}
          {error && <div className="session-dropdown__status settings-popover__error">{error}</div>}

          {!loading &&
            !error &&
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="session-dropdown__item"
                onClick={() => void handleSwitch(session.id)}
                disabled={busy}
              >
                <div>{session.title || session.preview || session.id}</div>
                <div className="session-dropdown__meta">{session.message_count} сообщ.</div>
              </button>
            ))}

          {!loading && !error && sessions.length === 0 && (
            <div className="session-dropdown__status">Нет сессий</div>
          )}
        </div>
      )}
    </div>
  )
}
