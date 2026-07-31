import { useEffect, useState } from 'react'
import type { ModelOptionsResult, RuntimeCheckResult } from '../../../shared/gateway/types'
import {
  PROVIDER_STATUS_LABELS,
  runtimeVerdict,
  toProviderRows,
  type ProviderRow
} from './providers-pure'

/** "Провайдеры и модели" (task 1.6.B2.4).
 *
 * Read-mostly: the catalogue, each provider's connection state, and the one
 * verdict that matters before a turn — would a prompt sent now reach a model.
 * Choosing a model goes through the SAME channel as the composer's picker
 * (`setModelConfig`); no second path to `config.set {key:'model'}` exists in
 * main, so the two surfaces cannot drift apart. */
export default function ProvidersSection({ disabled }: { disabled: boolean }) {
  const [options, setOptions] = useState<ModelOptionsResult | undefined>(undefined)
  const [check, setCheck] = useState<RuntimeCheckResult | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<string | undefined>(undefined)
  const [applyError, setApplyError] = useState<string | undefined>(undefined)

  async function load(refresh: boolean): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const [catalogue, runtime] = await Promise.all([
        window.aecpilot.getModelOptions(refresh),
        window.aecpilot.checkRuntime()
      ])
      setOptions(catalogue)
      setCheck(runtime)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let mounted = true
    Promise.all([window.aecpilot.getModelOptions(false), window.aecpilot.checkRuntime()])
      .then(([catalogue, runtime]) => {
        if (!mounted) return
        setOptions(catalogue)
        setCheck(runtime)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  const rows = options ? toProviderRows(options) : []
  const verdict = runtimeVerdict(check)

  async function selectModel(model: string): Promise<void> {
    setApplyError(undefined)
    try {
      await window.aecpilot.setModelConfig('model', model)
      await load(false)
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="settings-section">
      {verdict && (
        <div className="settings-popover__danger" role="alert">
          Ходы сейчас не пройдут: провайдер {verdict.provider} — {verdict.message}
        </div>
      )}

      {error && <div className="settings-popover__error">{error}</div>}
      {applyError && <div className="settings-popover__error">{applyError}</div>}

      <div className="settings-section__head">
        <div className="settings-section__hint">
          Текущая модель: {options?.model || 'не выбрана'}
        </div>
        <button
          type="button"
          className="settings-popover__link-btn"
          onClick={() => void load(true)}
          disabled={busy || disabled}
        >
          {busy ? 'обновляю…' : 'Обновить список'}
        </button>
      </div>

      {options && rows.length === 0 && (
        <div className="settings-section__empty">
          Ядро не вернуло ни одного провайдера. Проверьте раздел «Шлюз» — похоже, бэкенд не
          отвечает.
        </div>
      )}

      <ul className="provider-list">
        {rows.map((row) => (
          <ProviderRowView
            key={row.slug}
            row={row}
            currentModel={options?.model ?? ''}
            expanded={expanded === row.slug}
            disabled={disabled || busy}
            onToggle={() => setExpanded(expanded === row.slug ? undefined : row.slug)}
            onSelectModel={(model) => void selectModel(model)}
          />
        ))}
      </ul>
    </div>
  )
}

function ProviderRowView({
  row,
  currentModel,
  expanded,
  disabled,
  onToggle,
  onSelectModel
}: {
  row: ProviderRow
  currentModel: string
  expanded: boolean
  disabled: boolean
  onToggle: () => void
  onSelectModel: (model: string) => void
}) {
  return (
    <li className={`provider-row provider-row--${row.connection}`}>
      <button
        type="button"
        className="provider-row__head"
        onClick={onToggle}
        aria-expanded={expanded}
        disabled={row.modelCount === 0}
      >
        <span className="provider-row__name">
          {row.name}
          {row.current && <span className="provider-row__badge">текущий</span>}
        </span>
        <span className="provider-row__status">{PROVIDER_STATUS_LABELS[row.connection]}</span>
        <span className="provider-row__count">{row.modelCount} моделей</span>
      </button>
      {row.hint && <div className="provider-row__hint">{row.hint}</div>}
      {expanded && (
        <ul className="provider-row__models">
          {row.models.map((model) => (
            <li key={model}>
              <button
                type="button"
                className={`provider-row__model${
                  model === currentModel ? ' provider-row__model--current' : ''
                }`}
                onClick={() => onSelectModel(model)}
                disabled={disabled || row.connection === 'disconnected' || model === currentModel}
              >
                {model}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
