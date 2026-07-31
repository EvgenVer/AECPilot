import { useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  resolveSettingsSection,
  type SettingsSectionId
} from './settings-nav-pure'
import { AppearanceSection, LlmSection } from '../chat/SettingsPanel'
import ProvidersSection from '../settings/ProvidersSection'
import KeysSection from '../settings/KeysSection'

/** The settings screen (task 1.6.B2.1).
 *
 * Replaces the Phase-0 popover anchored under the gear. The popover was fine
 * for two fields; batch 2 adds providers, tools, MCP servers, plugins and a
 * config summary, and a popover cannot hold those. The content of the two
 * existing surfaces is unchanged — they simply became the first two sections.
 *
 * Only the open section is mounted. That preserves the popover's one good
 * property: settings the user never opens make no IPC call at all. */
export default function SettingsScreen({
  disabled,
  onClose,
  onRestarted
}: {
  disabled: boolean
  onClose: () => void
  onRestarted: () => void
}) {
  const [section, setSection] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION)
  const [keyEnvVars, setKeyEnvVars] = useState<string[]>([])

  // Which credential env vars the "Доступы" section may offer comes from the
  // provider catalogue, not from a list hard-coded here — a provider added by
  // a hermes upgrade would otherwise be unreachable. Fetched once, and only
  // when that section is opened, so the screen keeps its "sections you never
  // open make no call" property.
  useEffect(() => {
    if (section !== 'keys') return
    let mounted = true
    window.aecpilot
      .getModelOptions(false)
      .then((options) => {
        if (!mounted) return
        setKeyEnvVars(
          (options.providers ?? [])
            .filter((provider) => provider.auth_type === 'api_key' && provider.key_env)
            .map((provider) => provider.key_env as string)
        )
      })
      .catch(() => {
        // The section still works without the catalogue: main returns every
        // env var that already holds a key, so existing keys stay manageable.
        if (mounted) setKeyEnvVars([])
      })
    return () => {
      mounted = false
    }
  }, [section])

  return (
    <div className="settings-screen" role="dialog" aria-label="Настройки" aria-modal="true">
      <div className="settings-screen__panel">
        <div className="settings-screen__head">
          <div className="settings-screen__title">Настройки</div>
          <button
            type="button"
            className="settings-popover__close"
            onClick={onClose}
            aria-label="Закрыть настройки"
          >
            ✕
          </button>
        </div>

        <div className="settings-screen__body">
          <nav className="settings-screen__nav" aria-label="Разделы настроек">
            {SETTINGS_SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`settings-screen__nav-item${
                  item.id === section ? ' settings-screen__nav-item--active' : ''
                }`}
                aria-pressed={item.id === section}
                onClick={() => setSection(resolveSettingsSection(item.id))}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="settings-screen__content">
            {section === 'appearance' && <AppearanceSection />}
            {section === 'llm' && (
              <LlmSection disabled={disabled} onClose={onClose} onRestarted={onRestarted} />
            )}
            {section === 'providers' && <ProvidersSection disabled={disabled} />}
            {section === 'keys' && (
              <KeysSection candidates={keyEnvVars} disabled={disabled} onRestarted={onRestarted} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
