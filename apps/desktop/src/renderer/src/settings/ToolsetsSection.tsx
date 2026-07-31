import { useEffect, useState } from 'react'
import {
  AGENT_RESET_NOTICE,
  describeConfigureOutcome,
  describeEnableConfirmation,
  toToolsetRows,
  type ToolsetRow
} from './toolsets-pure'

/** "Инструменты" — which toolsets the agent may use (tasks 1.6.B2.6/1.6.B2.7).
 *
 * Enabling one grants capability, so it goes through a confirmation that NAMES
 * the tools being granted. Disabling does not: it only ever takes capability
 * away, and a confirmation there would just be a click to dismiss. */
export default function ToolsetsSection({ disabled }: { disabled: boolean }) {
  const [rows, setRows] = useState<ToolsetRow[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  const [pendingEnable, setPendingEnable] = useState<ToolsetRow | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<string | undefined>(undefined)
  const [resetNotice, setResetNotice] = useState(false)

  async function load(): Promise<void> {
    const result = await window.aecpilot.listToolsets()
    setRows(toToolsetRows(result))
  }

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .listToolsets()
      .then((result) => {
        if (mounted) setRows(toToolsetRows(result))
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function apply(row: ToolsetRow, action: 'enable' | 'disable'): Promise<void> {
    setBusy(true)
    setError(undefined)
    setPendingEnable(undefined)
    try {
      const result = await window.aecpilot.configureToolsets(action, [row.name])
      const described = describeConfigureOutcome(result, action)
      setOutcome(described.message)
      setResetNotice(described.agentReset)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}
      {outcome && <div className="settings-section__hint">{outcome}</div>}
      {resetNotice && <div className="settings-popover__warning">{AGENT_RESET_NOTICE}</div>}

      {rows && rows.length === 0 && (
        <div className="settings-section__empty">
          Ядро не вернуло ни одного набора инструментов. Это не «инструментов нет» — скорее шлюз
          отвечает не полностью; проверьте раздел «Шлюз».
        </div>
      )}

      <ul className="toolset-list">
        {(rows ?? []).map((row) => (
          <li key={row.name} className="toolset-row">
            <div className="toolset-row__head">
              <button
                type="button"
                className="toolset-row__name"
                aria-expanded={expanded === row.name}
                onClick={() => setExpanded(expanded === row.name ? undefined : row.name)}
              >
                {row.name}
                <span className="toolset-row__count">{row.toolCount}</span>
              </button>
              <span className={`toolset-row__state${row.enabled ? ' toolset-row__state--on' : ''}`}>
                {row.enabled ? 'включён' : 'выключен'}
              </span>
              <button
                type="button"
                className="settings-popover__link-btn"
                disabled={disabled || busy}
                onClick={() => {
                  if (row.enabled) void apply(row, 'disable')
                  else setPendingEnable(row)
                }}
              >
                {row.enabled ? 'Выключить' : 'Включить'}
              </button>
            </div>

            {row.description && <div className="toolset-row__desc">{row.description}</div>}

            {expanded === row.name && (
              <ul className="toolset-row__tools">
                {row.tools.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
                {row.tools.length === 0 && (
                  <li className="settings-section__hint">ядро не прислало состав этого набора</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {pendingEnable && (
        <div className="settings-section__confirm" role="alertdialog" aria-label="Включить набор">
          <div>{describeEnableConfirmation(pendingEnable)}</div>
          <div className="settings-section__confirm-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void apply(pendingEnable, 'enable')}
            >
              Включить
            </button>
            <button
              type="button"
              className="settings-popover__link-btn"
              disabled={busy}
              onClick={() => setPendingEnable(undefined)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
