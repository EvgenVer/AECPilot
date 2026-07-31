import { useEffect, useState } from 'react'
import {
  describeKillError,
  describeKillOutcome,
  EMPTY_HINT,
  formatUptime,
  mergeProcessRows,
  OTHERS_NOTICE,
  toOtherRows,
  toOwnRows,
  type ProcessRow
} from './processes-pure'
import { hasAnsiCodes, parseAnsi } from '../chat/vendor/hermes/ansi-pure'

const REFRESH_MS = 4000

/** "Фоновые процессы" — a bottom-panel tab (tasks 1.6.B2a.4–B2a.6; the same
 * surface task 1.6.B6.15 asked for, built once).
 *
 * Polls while it is visible and stops when it is not — `active` is false when
 * the panel is collapsed or another tab is showing, and a background timer
 * hitting the gateway for a panel nobody can see is pure waste. */
export default function ProcessesTab({ active }: { active: boolean }) {
  const [own, setOwn] = useState<ProcessRow[]>([])
  const [others, setOthers] = useState<ProcessRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState<ProcessRow | undefined>(undefined)

  useEffect(() => {
    if (!active) return
    let mounted = true

    async function load(): Promise<void> {
      try {
        const result = await window.aecpilot.listProcesses()
        if (!mounted) return
        const merged = mergeProcessRows(toOwnRows(result.own), toOtherRows(result.others))
        setOwn(merged.own)
        setOthers(merged.others)
        setLoaded(true)
        setError(undefined)
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      }
    }

    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [active])

  async function kill(row: ProcessRow): Promise<void> {
    setConfirming(undefined)
    setError(undefined)
    try {
      const result = await window.aecpilot.killProcess({ processId: row.id, confirmed: true })
      setNotice(describeKillOutcome(result.status, result.error))
      // The row stays and changes state instead of vanishing: a process that
      // disappears the moment it is stopped gives no confirmation it ever was.
      setOwn((rows) =>
        rows.map((entry) =>
          entry.id === row.id
            ? { ...entry, status: 'exited', exited: true, killable: false }
            : entry
        )
      )
    } catch (err) {
      setError(describeKillError(err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div className="processes-tab">
      {error && <div className="settings-popover__error">{error}</div>}
      {notice && <div className="settings-section__hint">{notice}</div>}

      {loaded && own.length === 0 && others.length === 0 && (
        <div className="settings-section__empty">{EMPTY_HINT}</div>
      )}

      {own.length > 0 && (
        <ul className="process-list">
          {own.map((row) => (
            <ProcessRowView
              key={row.id}
              row={row}
              expanded={expanded === row.id}
              onToggle={() => setExpanded(expanded === row.id ? undefined : row.id)}
              onKill={() => setConfirming(row)}
            />
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <>
          <div className="settings-section__hint">{OTHERS_NOTICE}</div>
          <ul className="process-list">
            {others.map((row) => (
              <ProcessRowView key={row.id} row={row} expanded={false} onToggle={() => {}} />
            ))}
          </ul>
        </>
      )}

      {confirming && (
        <div
          className="settings-section__confirm"
          role="alertdialog"
          aria-label="Остановить процесс"
        >
          <div>Остановить процесс «{confirming.command}»?</div>
          <div className="settings-section__confirm-actions">
            <button type="button" onClick={() => void kill(confirming)}>
              Остановить
            </button>
            <button
              type="button"
              className="settings-popover__link-btn"
              onClick={() => setConfirming(undefined)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProcessRowView({
  row,
  expanded,
  onToggle,
  onKill
}: {
  row: ProcessRow
  expanded: boolean
  onToggle: () => void
  onKill?: () => void
}) {
  const uptime = formatUptime(row.uptimeSeconds)
  return (
    <li className="process-row">
      <div className="process-row__head">
        <button
          type="button"
          className="process-row__command"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={!row.tail}
        >
          {row.command || '(без команды)'}
        </button>
        <span className="process-row__meta">
          {row.status}
          {uptime && ` · ${uptime}`}
          {row.pid !== undefined && ` · pid ${row.pid}`}
        </span>
        {onKill && row.killable && (
          <button type="button" className="settings-popover__link-btn" onClick={onKill}>
            Остановить
          </button>
        )}
      </div>
      {row.cwd && <div className="process-row__cwd">{row.cwd}</div>}
      {expanded && row.tail && (
        <>
          <pre className="process-row__output">
            {/* Same vendored parser as the tool card (1.6.11), unmodified —
                without it the reader sees `[0;32m` in the middle of the
                output. */}
            {hasAnsiCodes(row.tail)
              ? parseAnsi(row.tail).map((segment, index) => (
                  <span
                    key={index}
                    className={`ansi${segment.fg ? ` ansi--${segment.fg}` : ''}${
                      segment.bold ? ' ansi--bold' : ''
                    }`}
                  >
                    {segment.text}
                  </span>
                ))
              : row.tail}
          </pre>
          <div className="settings-section__hint">
            {row.tailIsPreview
              ? 'Показано короткое превью вывода — полного хвоста ядро не прислало.'
              : 'Показан только хвост вывода.'}
          </div>
        </>
      )}
    </li>
  )
}
