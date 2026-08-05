import { useEffect, useState } from 'react'
import { useAecT, useI18n, UI_LOCALES } from '../shared/i18n'

interface ProjectSettingsState {
  wiki_lang: string
  scan_interval_s: number
  embedding_model: string
}

function useProjectSettings(): {
  settings: ProjectSettingsState | null | undefined
  error: string | undefined
  save: (patch: Parameters<typeof window.aecpilot.updateProjectSettings>[0]) => Promise<boolean>
  saving: boolean
} {
  const [settings, setSettings] = useState<ProjectSettingsState | null | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getProjectSettings()
      .then((result) => {
        if (mounted) setSettings(result)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function save(
    patch: Parameters<typeof window.aecpilot.updateProjectSettings>[0]
  ): Promise<boolean> {
    setSaving(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.updateProjectSettings(patch)
      if (!result.ok) {
        setError(result.error)
        return false
      }
      setSettings(result.settings)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  return { settings, error, save, saving }
}

function NoProject() {
  return (
    <div className="settings-section__empty">
      Эти настройки принадлежат проекту — откройте проект, чтобы их менять.
    </div>
  )
}

/** "Язык" (task 1.6.B2.17, owner decision R9).
 *
 * Two different things live here and are stored in different places: the
 * INTERFACE language is the user's, and the WIKI language is the project's
 * (it travels with the vault, see specs/workspace-sources.md § Data schemas).
 *
 * The interface switch is live: it writes the choice through the i18n
 * provider's config client and every screen re-renders in the new language.
 * What is NOT yet complete is the coverage — the donor's screens arrive across
 * tasks 1.8.9–1.8.15 and their Russian strings arrive with them (task 6.7), so
 * an untranslated key falls back to English rather than to a blank. The hint
 * below says exactly that. */
export function LanguageSection() {
  const t = useAecT()
  const { locale, setLocale } = useI18n()
  const { settings, error, save, saving } = useProjectSettings()

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}

      <div className="settings-popover__field">
        <span>{t('settings.languageLabel')}</span>
        <div className="theme-switch" role="group" aria-label={t('settings.languageLabel')}>
          {UI_LOCALES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`theme-switch__option${
                locale === option.id ? ' theme-switch__option--active' : ''
              }`}
              aria-pressed={locale === option.id}
              onClick={() => void setLocale(option.id).catch(() => undefined)}
            >
              {option.name}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section__hint">{t('settings.languageHint')}</div>

      {settings === null && <NoProject />}
      {settings && (
        <label className="settings-popover__field">
          Язык вики проекта
          <input
            type="text"
            defaultValue={settings.wiki_lang}
            disabled={saving}
            onBlur={(event) => {
              const next = event.target.value.trim()
              if (next !== settings.wiki_lang) void save({ wikiLang: next })
            }}
          />
        </label>
      )}
      {settings && (
        <div className="settings-section__hint">
          На этом языке пишется вики проекта. Хранится в project.json — переезжает вместе с
          хранилищем.
        </div>
      )}
    </div>
  )
}

/** "Индексация" (task 1.6.B2.18, owner decision R9). Reuses the existing
 * `scan:*` channels — the manual run and the state indicator already exist for
 * the bottom panel. */
export function IndexingSection({ disabled }: { disabled: boolean }) {
  const { settings, error, save, saving } = useProjectSettings()
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getScanState()
      .then((state) => {
        if (mounted) setScanning(state.scanning)
      })
      .catch(() => {})
    const unsubscribe = window.aecpilot.onScanState((value) => setScanning(value))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}
      {scanError && <div className="settings-popover__error">{scanError}</div>}

      {settings === null && <NoProject />}
      {settings && (
        <>
          <label className="settings-popover__field">
            Интервал сканирования источников, секунд
            <input
              type="number"
              min={10}
              defaultValue={settings.scan_interval_s}
              disabled={saving || disabled}
              onBlur={(event) => {
                const next = Number(event.target.value)
                if (next !== settings.scan_interval_s) void save({ scanIntervalS: next })
              }}
            />
          </label>
          <div className="settings-section__hint">
            Новый интервал применяется сразу — расписание сканирования перезапускается.
          </div>

          <div className="settings-section__row">
            <span>Сканирование</span>
            <strong>{scanning ? 'идёт' : 'не идёт'}</strong>
          </div>

          <div className="settings-section__confirm-actions">
            <button
              type="button"
              disabled={scanning || disabled}
              onClick={() => {
                setScanError(undefined)
                void window.aecpilot.triggerScan().then((result) => {
                  if (!result.ok) setScanError(result.error ?? 'не удалось запустить сканирование')
                })
              }}
            >
              {scanning ? 'сканирую…' : 'Сканировать сейчас'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** "Эмбеддинги" (task 1.6.B2.19, owner decision R9).
 *
 * Changing the model invalidates every vector already stored (SPECIFICATION
 * C5), so the confirmation names that price rather than asking an abstract
 * "are you sure". */
export function EmbeddingsSection({ disabled }: { disabled: boolean }) {
  const { settings, error, save, saving } = useProjectSettings()
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)

  const value = draft ?? settings?.embedding_model ?? ''

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}

      {settings === null && <NoProject />}
      {settings && (
        <>
          <label className="settings-popover__field">
            Модель эмбеддингов
            <input
              type="text"
              value={value}
              disabled={saving || disabled}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>

          <div className="settings-section__hint">
            Смена модели обесценивает уже построенный индекс: вектора разных моделей несравнимы.
          </div>

          {!confirming && (
            <div className="settings-section__confirm-actions">
              <button
                type="button"
                disabled={
                  saving || disabled || value.trim() === '' || value === settings.embedding_model
                }
                onClick={() => setConfirming(true)}
              >
                Сменить модель
              </button>
            </div>
          )}

          {confirming && (
            <div
              className="settings-section__confirm"
              role="alertdialog"
              aria-label="Сменить модель эмбеддингов"
            >
              <div>
                После смены на «{value}» все источники придётся переиндексировать заново — до этого
                поиск по ним работать не будет.
              </div>
              <div className="settings-section__confirm-actions">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    void save({ embeddingModel: value.trim() }).then((ok) => {
                      if (ok) {
                        setConfirming(false)
                        setDraft(undefined)
                      }
                    })
                  }}
                >
                  Сменить и переиндексировать вручную
                </button>
                <button
                  type="button"
                  className="settings-popover__link-btn"
                  disabled={saving}
                  onClick={() => setConfirming(false)}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
