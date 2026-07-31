import { useEffect, useState } from 'react'
import {
  BUSY_MODE_LABELS,
  BUSY_MODES,
  CLEAR_PROMPT_VALUE,
  describeConfigError,
  readBusyMode,
  readFast,
  readPrompt,
  readReasoning,
  readToolProgress,
  REASONING_EFFORTS,
  TOOL_PROGRESS_LABELS,
  TOOL_PROGRESS_MODES,
  type BusyMode,
  type ToolProgressMode
} from './agent-config-pure'

/** "Поведение агента" (task 1.6.B2.13).
 *
 * Only the `config.set` keys that mean something in THIS app. Their TUI-only
 * display keys (`compact`, `statusbar`, `mouse`, `indicator`, `skin`,
 * `details_mode`, `thinking_mode`) are deliberately absent — owner decision R6,
 * and their own desktop does not set them either. Main's allowlist enforces
 * this independently, so the absence is structural rather than a matter of
 * this file not rendering a control. */
export default function AgentSection({ disabled }: { disabled: boolean }) {
  const [effort, setEffort] = useState('')
  const [reasoningShown, setReasoningShown] = useState(false)
  const [fast, setFast] = useState(false)
  // 'unknown' until the user sets it: `config.get` has no `verbose` key —
  // their gateway can write `display.tool_progress` but not read it back — so
  // preselecting a value here would be a guess presented as the truth.
  const [toolProgress, setToolProgress] = useState<ToolProgressMode | 'unknown'>('unknown')
  const [busyMode, setBusyMode] = useState<BusyMode>('queue')
  const [prompt, setPrompt] = useState('')
  const [savedPrompt, setSavedPrompt] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([
      window.aecpilot.getAgentConfig('reasoning'),
      window.aecpilot.getAgentConfig('fast'),
      window.aecpilot.getAgentConfig('busy'),
      window.aecpilot.getAgentConfig('prompt')
    ])
      .then(([reasoning, fastResult, busyResult, promptResult]) => {
        if (!mounted) return
        const parsed = readReasoning(reasoning)
        setEffort(parsed.effort)
        setReasoningShown(parsed.shown)
        setFast(readFast(fastResult))
        setBusyMode(readBusyMode(busyResult))
        const custom = readPrompt(promptResult)
        setPrompt(custom)
        setSavedPrompt(custom)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function write(
    key: 'reasoning' | 'fast' | 'busy' | 'prompt' | 'verbose',
    value: string,
    onOk: () => void
  ): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      await window.aecpilot.setAgentConfig(key, value)
      onOk()
    } catch (err) {
      setError(describeConfigError(key, err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}

      <label className="settings-popover__field">
        Глубина рассуждений
        <select
          value={effort}
          disabled={disabled || busy}
          onChange={(event) => {
            const next = event.target.value
            void write('reasoning', next, () => setEffort(next))
          }}
        >
          <option value="">по умолчанию у провайдера</option>
          {REASONING_EFFORTS.map((level) => (
            <option key={level} value={level}>
              {level === 'none' ? 'не рассуждать' : level}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-section__checkbox">
        <input
          type="checkbox"
          checked={reasoningShown}
          disabled={disabled || busy}
          onChange={(event) => {
            const next = event.target.checked
            void write('reasoning', next ? 'show' : 'hide', () => setReasoningShown(next))
          }}
        />
        Показывать рассуждение в переписке
      </label>

      <label className="settings-section__checkbox">
        <input
          type="checkbox"
          checked={fast}
          disabled={disabled || busy}
          onChange={(event) => {
            const next = event.target.checked
            void write('fast', next ? 'fast' : 'normal', () => setFast(next))
          }}
        />
        Быстрый режим (если модель его поддерживает)
      </label>

      <label className="settings-popover__field">
        Показ работы инструментов
        <select
          value={toolProgress}
          disabled={disabled || busy}
          onChange={(event) => {
            const next = readToolProgress({ value: event.target.value })
            void write('verbose', next, () => setToolProgress(next))
          }}
        >
          <option value="unknown" disabled>
            ядро не сообщает текущее значение — выберите, чтобы задать
          </option>
          {TOOL_PROGRESS_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {TOOL_PROGRESS_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-popover__field">
        Если написать во время хода
        <select
          value={busyMode}
          disabled={disabled || busy}
          onChange={(event) => {
            const next = event.target.value as BusyMode
            void write('busy', next, () => setBusyMode(next))
          }}
        >
          {BUSY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {BUSY_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
      </label>

      <label className="settings-popover__field">
        Свой системный промпт
        <textarea
          value={prompt}
          rows={4}
          disabled={disabled || busy}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>
      <div className="settings-section__confirm-actions">
        <button
          type="button"
          disabled={disabled || busy || prompt === savedPrompt}
          onClick={() => void write('prompt', prompt, () => setSavedPrompt(prompt))}
        >
          Сохранить промпт
        </button>
        {savedPrompt !== '' && (
          <button
            type="button"
            className="settings-popover__link-btn"
            disabled={disabled || busy}
            onClick={() =>
              void write('prompt', CLEAR_PROMPT_VALUE, () => {
                setPrompt('')
                setSavedPrompt('')
              })
            }
          >
            Убрать промпт
          </button>
        )}
      </div>
    </div>
  )
}
