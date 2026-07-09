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
 * a successful save. */
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
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        width: 360,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 10,
        fontSize: 13,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600 }}>Настройки LLM</div>
        <button onClick={onClose} disabled={saving} style={{ font: 'inherit' }}>
          ✕
        </button>
      </div>

      {loadError && <div style={{ color: '#c33' }}>{loadError}</div>}

      {settings && (
        <>
          {settings.envOverridesKey && (
            <div style={{ color: '#a72', fontSize: 12 }}>
              runtime/dev-profile/.env задаёт ключ провайдера — он имеет приоритет над ключом из
              настроек (dev-режим).
            </div>
          )}
          {!settings.encryptionAvailable && (
            <div style={{ color: '#c33', fontSize: 12 }}>
              safeStorage недоступен — ключ не будет сохранён.
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Model
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="gpt-5-mini"
              disabled={saving || disabled}
              style={{ padding: '6px 8px', fontSize: 13 }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Base URL
            <input
              type="text"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={saving || disabled}
              style={{ padding: '6px 8px', fontSize: 13 }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            API key
            <input
              type="password"
              value={keyInput}
              onChange={(event) => {
                setKeyInput(event.target.value)
                if (event.target.value) setClearKey(false)
              }}
              placeholder={settings.hasKey ? '••••• (сохранён)' : ''}
              disabled={saving || disabled || clearKey}
              style={{ padding: '6px 8px', fontSize: 13 }}
            />
          </label>

          {settings.hasKey && !clearKey && (
            <button
              onClick={() => {
                setClearKey(true)
                setKeyInput('')
              }}
              disabled={saving || disabled}
              style={{ alignSelf: 'flex-start', fontSize: 12 }}
            >
              Очистить ключ
            </button>
          )}
          {clearKey && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Ключ будет удалён при сохранении.{' '}
              <button
                onClick={() => setClearKey(false)}
                disabled={saving}
                style={{ font: 'inherit' }}
              >
                Отмена
              </button>
            </div>
          )}

          {saveError && <div style={{ color: '#c33' }}>{saveError}</div>}

          <button onClick={() => void handleSave()} disabled={saving || disabled}>
            {saving ? 'применяю (перезапуск агента)…' : 'Сохранить'}
          </button>
        </>
      )}
    </div>
  )
}
