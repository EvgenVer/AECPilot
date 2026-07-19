import { useEffect, useState } from 'react'
import { applyTheme, persistTheme, readStoredTheme, type Theme } from '../theme'

interface LlmSettingsState {
  model?: string
  baseUrl?: string
  hasKey: boolean
  encryptionAvailable: boolean
  envOverridesKey: boolean
}

/** Settings panel: LLM settings (task 0.15) plus, since task 1.5.10, an
 * "Параметры приложения" section for app-level settings — currently just the
 * light/dark theme switch (UR10 lists LLM endpoint/keys/models, languages,
 * scan interval, embedding and theme as "Параметры приложения — в
 * Settings"; only theme is wired here so far). The theme switch is
 * independent of `disabled`/IPC entirely — it only touches
 * `document.documentElement` and `localStorage` (../theme.ts) — so it stays
 * usable even while the LLM section below is disabled during an active chat
 * turn.
 *
 * LLM section: endpoint/key/model, applied to the hermes profile on save.
 * The panel makes no IPC call until it is actually opened — `getLlmSettings`
 * fires on open, not on mount — so a closed panel never touches the backend.
 * Saving restarts the hermes backend to apply the change; the API key never
 * leaves this component in plaintext beyond the one `saveLlmSettings` call,
 * and the local key input is cleared right after a successful save. Anchored
 * under the top bar's settings gear (task 1.0 — moved from the chat
 * header). */
export default function SettingsPanel({
  disabled,
  onClose,
  onRestarted
}: {
  disabled: boolean
  onClose: () => void
  onRestarted: () => void
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme(window.localStorage))
  const [settings, setSettings] = useState<LlmSettingsState | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>(undefined)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | undefined>(undefined)

  function selectTheme(next: Theme): void {
    applyTheme(document.documentElement, next)
    persistTheme(window.localStorage, next)
    setThemeState(next)
  }

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
        <div className="settings-popover__title">Настройки</div>
        <button
          type="button"
          className="settings-popover__close"
          onClick={onClose}
          disabled={saving}
        >
          ✕
        </button>
      </div>

      <div className="settings-popover__section-title">Параметры приложения</div>
      <div className="settings-popover__field">
        <span>Тема</span>
        <div className="theme-switch" role="group" aria-label="Тема">
          <button
            type="button"
            className={`theme-switch__option${
              theme === 'light' ? ' theme-switch__option--active' : ''
            }`}
            aria-pressed={theme === 'light'}
            onClick={() => selectTheme('light')}
          >
            Светлая
          </button>
          <button
            type="button"
            className={`theme-switch__option${
              theme === 'dark' ? ' theme-switch__option--active' : ''
            }`}
            aria-pressed={theme === 'dark'}
            onClick={() => selectTheme('dark')}
          >
            Тёмная
          </button>
        </div>
      </div>

      <div className="settings-popover__section-title">Настройки LLM</div>

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
