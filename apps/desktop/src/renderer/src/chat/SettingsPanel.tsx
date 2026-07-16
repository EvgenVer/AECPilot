import { useEffect, useState } from 'react'

interface LlmSettingsState {
  model?: string
  baseUrl?: string
  hasKey: boolean
  encryptionAvailable: boolean
  envOverridesKey: boolean
}

/** LLM settings panel (task 0.15): endpoint/key/model, applied to the hermes
 * profile on save. The panel makes no IPC call until it is actually opened —
 * `getLlmSettings` fires on open, not on mount — so a closed panel never
 * touches the backend. Saving restarts the hermes backend to apply the
 * change; the API key never leaves this component in plaintext beyond the
 * one `saveLlmSettings` call, and the local key input is cleared right after
 * a successful save. Anchored under the top bar's settings gear (task 1.0 —
 * moved from the chat header). */
export default function SettingsPanel({
  disabled,
  onClose,
  onRestarted
}: {
  disabled: boolean
  onClose: () => void
  onRestarted: () => void
}) {
  const [settings, setSettings] = useState<LlmSettingsState | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getLlmSettings()
      .then((result) => {
        if (!mounted) return
        setSettings(result)
        setModel(result.model ?? '')
        setBaseUrl(result.baseUrl ?? '')
      })
      .catch((error) => {
        if (mounted) setLoadError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function handleSave(): Promise<void> {
    setSaving(true)
    setSaveError(undefined)
    try {
      const result = await window.aecpilot.saveLlmSettings({
        model: model.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
        key: clearKey ? null : keyInput.trim() ? keyInput.trim() : undefined
      })
      setKeyInput('')
      if (!result.ok) {
        setSaveError(result.error ?? 'не удалось применить настройки')
        return
      }
      // A real restart resets the backend's session state, so drop the stale
      // transcript. Under the e2e override (restarted === false) nothing was
      // restarted — keep the conversation on screen.
      if (result.restarted) onRestarted()
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
      setKeyInput('')
    }
  }

  return (
    <div className="settings-popover">
      <div className="settings-popover__head">
        <div className="settings-popover__title">Настройки LLM</div>
        <button
          type="button"
          className="settings-popover__close"
          onClick={onClose}
          disabled={saving}
        >
          ✕
        </button>
      </div>

      {loadError && <div className="settings-popover__error">{loadError}</div>}

      {settings && (
        <>
          {settings.envOverridesKey && (
            <div className="settings-popover__warning">
              runtime/dev-profile/.env задаёт ключ провайдера — он имеет приоритет над ключом из
              настроек (dev-режим).
            </div>
          )}
          {!settings.encryptionAvailable && (
            <div className="settings-popover__danger">
              safeStorage недоступен — ключ не будет сохранён.
            </div>
          )}

          <label className="settings-popover__field">
            Модель
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-5-mini"
              disabled={saving || disabled}
            />
          </label>

          <label className="settings-popover__field">
            Base URL
            <input
              type="text"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={saving || disabled}
            />
          </label>

          <label className="settings-popover__field">
            API-ключ
            <input
              type="password"
              value={keyInput}
              onChange={(event) => {
                setKeyInput(event.target.value)
                if (event.target.value) setClearKey(false)
              }}
              placeholder={settings.hasKey ? '••••• (сохранён)' : ''}
              disabled={saving || disabled || clearKey}
            />
          </label>

          {settings.hasKey && !clearKey && (
            <button
              type="button"
              className="settings-popover__link-btn"
              onClick={() => {
                setClearKey(true)
                setKeyInput('')
              }}
              disabled={saving || disabled}
            >
              Очистить ключ
            </button>
          )}
          {clearKey && (
            <div className="settings-popover__hint">
              Ключ будет удалён при сохранении.{' '}
              <button
                type="button"
                className="settings-popover__link-btn"
                onClick={() => setClearKey(false)}
                disabled={saving}
              >
                Отмена
              </button>
            </div>
          )}

          {saveError && <div className="settings-popover__error">{saveError}</div>}

          <button
            type="button"
            className="settings-popover__save"
            onClick={() => void handleSave()}
            disabled={saving || disabled}
          >
            {saving ? 'применяю (перезапуск агента)…' : 'Сохранить'}
          </button>
        </>
      )}
    </div>
  )
}
