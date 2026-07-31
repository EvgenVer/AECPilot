// Interface language preference (task 1.6.B2.17, owner decision R9). Same
// shape and the same hardening as theme.ts: injected storage, a throwing
// `localStorage` never takes the first render down.
//
// This stores a PREFERENCE. The interface itself is Russian-only today —
// translating it is its own body of work, and the settings section says so out
// loud rather than offering a switch that pretends to do something. Keeping
// the preference now means the eventual translation has a value to read
// instead of having to invent a migration.

export type UiLanguage = 'ru' | 'en'

const STORAGE_KEY = 'aecpilot.ui-language'

const DEFAULT_UI_LANGUAGE: UiLanguage = 'ru'

export function readStoredUiLanguage(storage: Pick<Storage, 'getItem'>): UiLanguage {
  try {
    return storage.getItem(STORAGE_KEY) === 'en' ? 'en' : DEFAULT_UI_LANGUAGE
  } catch {
    return DEFAULT_UI_LANGUAGE
  }
}

export function persistUiLanguage(storage: Pick<Storage, 'setItem'>, language: UiLanguage): void {
  try {
    storage.setItem(STORAGE_KEY, language)
  } catch {
    // best-effort, exactly as in theme.ts: losing persistence must not stop
    // the choice from applying for this session.
  }
}
