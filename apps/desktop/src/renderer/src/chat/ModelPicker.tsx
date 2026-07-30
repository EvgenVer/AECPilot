import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionRuntime } from './chat-state'
import {
  REASONING_LEVELS,
  knobsFor,
  modelSwitchBlockedReason,
  pickerSummary,
  reasoningLabel,
  toModelRows,
  type ModelRow
} from './model-picker-pure'

/** Model / reasoning-effort / fast picker in the composer (task 1.6.9).
 *
 * What it shows is the runtime the gateway reports (`session.info`), never the
 * last thing clicked: their `config.set` can answer "switched" while the live
 * agent stays put, and a picker that believed its own click would then lie
 * about which model is answering.
 *
 * The model list is fetched on first open, not on mount — it is a network call
 * per provider on their side, and most sessions never touch the picker. */
export default function ModelPicker({
  runtime,
  streaming,
  connected
}: {
  runtime: SessionRuntime
  streaming: boolean
  connected: boolean
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  /** A switch their side refused until the cost is confirmed. Holding the
   * model here (rather than re-sending blind) keeps the confirmation a
   * decision instead of a formality. */
  const [confirm, setConfirm] = useState<{ model: string; message: string } | undefined>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)

  const blockedReason = modelSwitchBlockedReason({ connected, streaming })
  const knobs = knobsFor(rows, runtime.model)

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true)
      setError(undefined)
      try {
        const options = await window.aecpilot.getModelOptions(refresh)
        setRows(toModelRows(options, runtime.model))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [runtime.model]
  )

  /** Opening is what fetches the catalogue — deliberately here and not in an
   * effect: the fetch is a consequence of the click, not of the open state
   * being synchronised with anything. */
  const toggle = useCallback((): void => {
    const next = !open
    setOpen(next)
    if (next && rows.length === 0 && !loading) void load(false)
  }, [open, rows.length, loading, load])

  // Close on an outside click, so the menu does not sit over the transcript
  // after the user has moved on.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const apply = useCallback(
    async (
      key: 'model' | 'reasoning' | 'fast',
      value: string,
      confirmExpensive?: boolean
    ): Promise<void> => {
      setError(undefined)
      try {
        const result = await window.aecpilot.setModelConfig(key, value, confirmExpensive)
        if (result.confirm_required) {
          setConfirm({ model: value, message: result.confirm_message || 'Модель платная.' })
          return
        }
        setConfirm(undefined)
        // Deliberately no local state update here: the picker's displayed
        // value comes from the gateway's `session.info`, which follows.
        if (result.warning) setError(result.warning)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    []
  )

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className="model-picker__button"
        onClick={toggle}
        title={blockedReason ?? 'Модель, глубина рассуждений, быстрый режим'}
        aria-expanded={open}
      >
        {pickerSummary(runtime)}
      </button>

      {open && (
        <div className="model-picker__menu" role="menu">
          {blockedReason && <p className="model-picker__note">{blockedReason}</p>}
          {error && <p className="model-picker__error">{error}</p>}

          {confirm && (
            <div className="model-picker__confirm">
              <p>{confirm.message}</p>
              <button type="button" onClick={() => void apply('model', confirm.model, true)}>
                Всё равно переключить
              </button>
              <button type="button" onClick={() => setConfirm(undefined)}>
                Отмена
              </button>
            </div>
          )}

          <div className="model-picker__section">
            <div className="model-picker__head">
              <span>Модель</span>
              <button
                type="button"
                className="model-picker__refresh"
                onClick={() => void load(true)}
                disabled={loading}
              >
                Обновить список
              </button>
            </div>
            {loading && <p className="model-picker__note">Загружаю…</p>}
            {!loading && rows.length === 0 && !error && (
              <p className="model-picker__note">Список моделей пуст</p>
            )}
            <ul className="model-picker__list">
              {rows.map((row) => (
                <li key={`${row.providerSlug}/${row.model}`}>
                  <button
                    type="button"
                    className={`model-picker__row${row.current ? ' model-picker__row--current' : ''}`}
                    disabled={row.disabledReason !== undefined || blockedReason !== undefined}
                    title={row.disabledReason}
                    onClick={() => void apply('model', row.value)}
                  >
                    <span className="model-picker__model">{row.model}</span>
                    <span className="model-picker__provider">{row.providerName}</span>
                    {row.disabledReason && (
                      <span className="model-picker__reason">{row.disabledReason}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {knobs.reasoning && (
            <div className="model-picker__section">
              <div className="model-picker__head">
                <span>Глубина рассуждений</span>
              </div>
              <div className="model-picker__chips">
                {REASONING_LEVELS.map((level) => (
                  <button
                    type="button"
                    key={level}
                    className={`model-picker__chip${
                      runtime.reasoningEffort === level ? ' model-picker__chip--on' : ''
                    }`}
                    onClick={() => void apply('reasoning', level)}
                  >
                    {reasoningLabel(level)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {knobs.fast && (
            <div className="model-picker__section">
              <button
                type="button"
                className={`model-picker__chip${runtime.fast ? ' model-picker__chip--on' : ''}`}
                onClick={() => void apply('fast', runtime.fast ? 'normal' : 'fast')}
              >
                Быстрый режим {runtime.fast ? 'включён' : 'выключен'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
