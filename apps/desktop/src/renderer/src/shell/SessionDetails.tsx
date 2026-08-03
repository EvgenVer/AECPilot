import { useEffect, useState } from 'react'
import type {
  ContextBreakdownResult,
  HistoryMessage,
  SessionUsageResult
} from '../../../shared/gateway/types'
import {
  breakdownRows,
  creditLines,
  describeCompression,
  describeContextFill,
  describeUndo,
  formatTokens,
  usageLines,
  BREAKDOWN_EMPTY_HINT,
  UNDO_HINT
} from './session-details-pure'

/** "Детали сессии" (tasks 1.6.B5.11–B5.15). Contract: specs/agent-sessions.md.
 *
 * Two of the three actions here are refused by the gateway while a turn is
 * running (4009 for both `session.compress` and `session.undo`), so both
 * controls are disabled instead of failing on click — the same shape the model
 * picker already uses for their mid-turn model guard. */
export default function SessionDetails({
  streaming,
  onSessionLoaded,
  onTurnUndone
}: {
  streaming: boolean
  /** Redraws the transcript after a compression — from `session.history`,
   * which main re-reads, NOT from `session.compress`'s own `messages` (that
   * field is the agent's raw history and renders as empty bubbles). */
  onSessionLoaded: (messages: HistoryMessage[]) => void
  onTurnUndone: (removed: number) => void
}) {
  const [usage, setUsage] = useState<SessionUsageResult | undefined>(undefined)
  const [breakdown, setBreakdown] = useState<ContextBreakdownResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [focusTopic, setFocusTopic] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    let mounted = true
    void Promise.resolve().then(async () => {
      try {
        const [nextUsage, nextBreakdown] = await Promise.all([
          window.aecpilot.getSessionUsage(),
          window.aecpilot.getContextBreakdown()
        ])
        if (!mounted) return
        setUsage(nextUsage)
        setBreakdown(nextBreakdown)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      }
    })
    return () => {
      mounted = false
    }
  }, [open])

  async function refresh(): Promise<void> {
    const [nextUsage, nextBreakdown] = await Promise.all([
      window.aecpilot.getSessionUsage(),
      window.aecpilot.getContextBreakdown()
    ])
    setUsage(nextUsage)
    setBreakdown(nextBreakdown)
  }

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function compress(): Promise<void> {
    await run(async () => {
      const outcome = await window.aecpilot.compressSession(focusTopic)
      onSessionLoaded(outcome.messages)
      setNotice(describeCompression(outcome))
      setFocusTopic('')
      await refresh()
    })
  }

  async function undo(): Promise<void> {
    await run(async () => {
      const { removed } = await window.aecpilot.undoTurn()
      onTurnUndone(removed)
      setNotice(describeUndo(removed))
      await refresh()
    })
  }

  const rows = breakdownRows(breakdown)
  const credits = creditLines(usage)

  return (
    <div className="session-details">
      <button
        type="button"
        className="settings-popover__link-btn"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Скрыть детали сессии' : 'Детали сессии'}
      </button>

      {open && (
        <>
          {error && <div className="settings-popover__error">{error}</div>}
          {notice && <div className="settings-section__hint">{notice}</div>}

          <dl className="usage-grid">
            {usageLines(usage).map((line) => (
              <div key={line.label} className="usage-grid__row">
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
          <div className="settings-section__hint">Контекст: {describeContextFill(usage)}</div>

          {credits.length > 0 && (
            <ul className="usage-credits">
              {credits.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}

          <div className="settings-popover__section-title">Из чего состоит контекст</div>
          {rows.length === 0 ? (
            <div className="settings-section__empty">{BREAKDOWN_EMPTY_HINT}</div>
          ) : (
            <ul className="breakdown-list">
              {rows.map((row) => (
                <li key={row.id} className="breakdown-row">
                  <span className="breakdown-row__label">{row.label}</span>
                  {/* The bar is coloured from OUR tokens; their `color` field
                      names a CSS variable of their own design system and is
                      dropped in `breakdownRows`. */}
                  <span className="breakdown-row__bar" aria-hidden="true">
                    <span style={{ width: `${row.share}%` }} />
                  </span>
                  <span className="breakdown-row__value">
                    {formatTokens(row.tokens)} · {row.share} %
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="settings-section__confirm-actions">
            <input
              type="text"
              value={focusTopic}
              placeholder="что сохранить при сжатии (необязательно)"
              aria-label="Тема, важная при сжатии"
              onChange={(event) => setFocusTopic(event.target.value)}
              disabled={busy || streaming}
            />
            <button
              type="button"
              onClick={() => void compress()}
              disabled={busy || streaming}
              title={
                streaming
                  ? 'Во время хода ядро сжимать отказывается — дождитесь ответа'
                  : 'Сжать контекст сессии'
              }
            >
              Сжать контекст
            </button>
          </div>

          <div className="settings-section__hint">{UNDO_HINT}</div>
          <div className="settings-section__confirm-actions">
            <button
              type="button"
              onClick={() => void undo()}
              disabled={busy || streaming}
              title={
                streaming
                  ? 'Во время хода ядро отмену не принимает — дождитесь ответа'
                  : 'Снять последний ход у агента'
              }
            >
              Отменить последний ход
            </button>
          </div>
        </>
      )}
    </div>
  )
}
