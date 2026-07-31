// Section list and selection for the settings screen (task 1.6.B2.1). Pure so
// the rules are pinned by node tests and the screen stays a thin shell.
//
// The screen replaces the Phase-0 popover, which held exactly two things:
// appearance and the LLM connection. Those become the first two sections; the
// rest of batch 2 adds its own by extending SECTIONS, and nothing else has to
// change — which is the point of keeping this list in one place.

export type SettingsSectionId =
  | 'appearance'
  | 'llm'
  | 'providers'
  | 'keys'
  | 'tools'
  | 'mcp'
  | 'plugins'
  | 'agent'
  | 'gateway'
  | 'language'
  | 'indexing'
  | 'embeddings'
  | 'summary'

export interface SettingsSection {
  id: SettingsSectionId
  label: string
}

// Order is the reading order of the screen, not the order the sections were
// built in: what the app looks like, then what it talks to, then what the
// agent may do, then the read-only summary.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'appearance', label: 'Оформление' },
  { id: 'llm', label: 'Подключение к модели' },
  { id: 'providers', label: 'Провайдеры и модели' },
  { id: 'keys', label: 'Доступы' },
  { id: 'agent', label: 'Поведение агента' },
  { id: 'tools', label: 'Инструменты' },
  { id: 'mcp', label: 'MCP-серверы' },
  { id: 'plugins', label: 'Плагины' },
  { id: 'language', label: 'Язык' },
  { id: 'indexing', label: 'Индексация' },
  { id: 'embeddings', label: 'Эмбеддинги' },
  { id: 'gateway', label: 'Шлюз' },
  { id: 'summary', label: 'Как настроено' }
]

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'appearance'

/** The section to show for a stored/requested id.
 *
 * An id that no longer exists (a section removed between releases, a stale
 * value in local storage) resolves to the default rather than to a blank
 * screen — the failure mode of an empty settings pane is a bug report about
 * "settings don't open". */
export function resolveSettingsSection(id: string | undefined): SettingsSectionId {
  return SETTINGS_SECTIONS.some((section) => section.id === id)
    ? (id as SettingsSectionId)
    : DEFAULT_SETTINGS_SECTION
}

export function settingsSectionLabel(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? ''
}
