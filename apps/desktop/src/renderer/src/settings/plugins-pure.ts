// Pure logic behind the "Плагины" section (tasks 1.6.B2a.2 / 1.6.B2a.3).
//
// Measured by `runtime/plugins-probe.mjs` (task 1.6.B2a.1) rather than assumed:
// `status` has THREE values, not two — `enabled`, `disabled` (switched off
// explicitly) and `not enabled` (never touched). A screen that compares
// against two of them mislabels the third.

import type { PluginRow } from '../../../shared/gateway/types'

export type PluginState = 'enabled' | 'disabled' | 'untouched' | 'unknown'

export interface PluginEntry {
  name: string
  version: string
  description: string
  /** True for plugins shipped with hermes. Anything else is third-party code
   * that would run inside the gateway process. */
  bundled: boolean
  state: PluginState
}

export function normalizePluginState(status: string | undefined): PluginState {
  const value = (status ?? '').trim().toLowerCase()
  if (value === 'enabled') return 'enabled'
  if (value === 'disabled') return 'disabled'
  if (value === 'not enabled') return 'untouched'
  return 'unknown'
}

export const PLUGIN_STATE_LABELS: Record<PluginState, string> = {
  enabled: 'включён',
  disabled: 'выключен',
  untouched: 'не включался',
  unknown: 'состояние неизвестно'
}

export function toPluginEntries(rows: PluginRow[] | undefined): PluginEntry[] {
  return (rows ?? [])
    .filter((row) => typeof row?.name === 'string' && row.name !== '')
    .map((row) => ({
      name: row.name,
      version: row.version ?? '',
      description: row.description ?? '',
      bundled: (row.source ?? '') === 'bundled',
      state: normalizePluginState(row.status)
    }))
}

export interface PluginGroups {
  user: PluginEntry[]
  bundled: PluginEntry[]
}

export function groupPlugins(entries: PluginEntry[]): PluginGroups {
  return {
    user: entries.filter((entry) => !entry.bundled),
    bundled: entries.filter((entry) => entry.bundled)
  }
}

/** Whether switching this plugin on needs an explicit confirmation.
 *
 * Only for a user plugin, and only when enabling: that is third-party code
 * being activated inside the agent's process. Disabling never needs one — it
 * removes capability. (Main re-checks `source` against the gateway's own list,
 * so this is the UI half of a rule enforced on both sides.) */
export function needsEnableConfirmation(entry: PluginEntry, enable: boolean): boolean {
  return enable && !entry.bundled
}

export const USER_PLUGIN_WARNING =
  'Это сторонний плагин: он выполняется внутри процесса агента и получает те же права. Включать?'

/** What can be said honestly about when a toggle takes effect.
 *
 * The probe could not confirm that a toggle reaches an already-built agent —
 * `session.info.tools` is empty on a fresh session, so there was nothing to
 * measure against. Promising "applies immediately" on that evidence would be a
 * guess; the screen says the part that is certain. */
export const PLUGIN_EFFECT_NOTICE =
  'Изменение вступит в силу для новых сессий агента; проверить, подхватит ли его уже запущенная, мы не смогли.'

export const PLUGINS_EMPTY_HINT =
  'Плагины ставятся вне приложения — в каталог плагинов профиля hermes. Пустой список означает, что там ничего нет, а не поломку.'
