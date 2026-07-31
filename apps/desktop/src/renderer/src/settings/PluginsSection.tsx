import { useEffect, useState } from 'react'
import {
  groupPlugins,
  needsEnableConfirmation,
  normalizePluginState,
  PLUGIN_EFFECT_NOTICE,
  PLUGIN_STATE_LABELS,
  PLUGINS_EMPTY_HINT,
  toPluginEntries,
  USER_PLUGIN_WARNING,
  type PluginEntry
} from './plugins-pure'

/** "Плагины" (tasks 1.6.B2a.2 / 1.6.B2a.3).
 *
 * Owner decision R7: toggling only. Installing a plugin means putting code in
 * the profile's plugin directory, which happens outside this app — so the
 * empty state says where they come from instead of looking broken. */
export default function PluginsSection({ disabled }: { disabled: boolean }) {
  const [entries, setEntries] = useState<PluginEntry[] | undefined>(undefined)
  const [counts, setCounts] = useState({ user: 0, bundled: 0 })
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PluginEntry | undefined>(undefined)

  async function load(): Promise<void> {
    const result = await window.aecpilot.listPlugins()
    setEntries(toPluginEntries(result.plugins))
    setCounts({ user: result.userCount, bundled: result.bundledCount })
  }

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .listPlugins()
      .then((result) => {
        if (!mounted) return
        setEntries(toPluginEntries(result.plugins))
        setCounts({ user: result.userCount, bundled: result.bundledCount })
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function toggle(entry: PluginEntry, enable: boolean): Promise<void> {
    setBusy(true)
    setError(undefined)
    setPending(undefined)
    try {
      const result = await window.aecpilot.togglePlugin({
        name: entry.name,
        enable,
        ...(needsEnableConfirmation(entry, enable) ? { confirmed: true } : {})
      })
      // The new state comes from the row the gateway returned, never from what
      // we asked for: `unchanged: true` means it was already like that, and
      // drawing our request as the result would show a change that did not
      // happen.
      if (result.plugin) {
        const next = normalizePluginState(result.plugin.status)
        setEntries((prev) =>
          (prev ?? []).map((row) => (row.name === entry.name ? { ...row, state: next } : row))
        )
      } else {
        await load()
      }
      setNotice(
        result.unchanged
          ? `Плагин ${entry.name} уже был в этом состоянии.`
          : `Плагин ${entry.name}: ${enable ? 'включён' : 'выключен'}. ${PLUGIN_EFFECT_NOTICE}`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const groups = groupPlugins(entries ?? [])

  return (
    <div className="settings-section">
      {error && <div className="settings-popover__error">{error}</div>}
      {notice && <div className="settings-section__hint">{notice}</div>}

      <div className="settings-section__hint">
        Свои плагины: {counts.user} · встроенных: {counts.bundled}
      </div>

      {entries && entries.length === 0 && (
        <div className="settings-section__empty">{PLUGINS_EMPTY_HINT}</div>
      )}

      {(['user', 'bundled'] as const).map((group) =>
        groups[group].length === 0 ? null : (
          <div key={group}>
            <div className="settings-popover__section-title">
              {group === 'user' ? 'Свои' : 'Встроенные'}
            </div>
            <ul className="plugin-list">
              {groups[group].map((entry) => (
                <li key={entry.name} className="plugin-row">
                  <div className="plugin-row__head">
                    <span className="plugin-row__name">{entry.name}</span>
                    {entry.version && <span className="plugin-row__version">{entry.version}</span>}
                    <span className="plugin-row__state">{PLUGIN_STATE_LABELS[entry.state]}</span>
                    <button
                      type="button"
                      className="settings-popover__link-btn"
                      disabled={disabled || busy}
                      onClick={() => {
                        const enable = entry.state !== 'enabled'
                        if (needsEnableConfirmation(entry, enable)) setPending(entry)
                        else void toggle(entry, enable)
                      }}
                    >
                      {entry.state === 'enabled' ? 'Выключить' : 'Включить'}
                    </button>
                  </div>
                  {entry.description && <div className="plugin-row__desc">{entry.description}</div>}
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {pending && (
        <div className="settings-section__confirm" role="alertdialog" aria-label="Включить плагин">
          <div>
            {USER_PLUGIN_WARNING} ({pending.name})
          </div>
          <div className="settings-section__confirm-actions">
            <button type="button" disabled={busy} onClick={() => void toggle(pending, true)}>
              Включить
            </button>
            <button
              type="button"
              className="settings-popover__link-btn"
              disabled={busy}
              onClick={() => setPending(undefined)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
