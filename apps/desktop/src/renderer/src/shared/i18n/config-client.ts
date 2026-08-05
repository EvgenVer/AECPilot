// Where the interface language is stored.
//
// Their `I18nProvider` persists the choice in the CORE's config
// (`display.language`) through the gateway. We keep it in our own storage
// instead, and their provider takes it as an injected `configClient`, so this
// is a choice at the mount point — not an edit to their file.
//
// Two reasons for the split:
//  1. The core's `display.language` supports en, zh, ja, de, es, fr, tr, uk and
//     falls back to English for anything else — Russian included. Storing 'ru'
//     there would set our UI language by way of a field that cannot represent
//     it, and would silently move the core's own prompts to English-by-fallback
//     as a side effect.
//  2. SPEC G7 has three separate language levels (interface, agent, wiki). The
//     interface one is the user's and local; wiring it to a project-scoped core
//     setting would conflate two of the three. Task 5.14 settles the whole set.

import type { Locale } from '../../donor/i18n/types'
import { localeConfigValue, normalizeLocale } from '../../donor/i18n/languages'

/** The key our pre-migration language preference already used, so a user who
 * picked English before this migration keeps it. */
const STORAGE_KEY = 'aecpilot.ui-language'

/** Their `HermesConfigRecord` — an open record of config sections. We only
 * ever read and write `display.language` inside it; the index signature is
 * what makes this assignable to the client type their provider expects. */
export type StoredConfig = Record<string, unknown> & {
  display?: { language?: unknown }
}

/** Our default, not theirs. Their `DEFAULT_LOCALE` is English because that is
 * their audience; ours is Russian (SPEC C7 — first deployments are Russian
 * engineering offices, and the pre-migration preference defaulted the same
 * way). English stays the FALLBACK for an untranslated key, which is a
 * different question and lives in `defineLocale`. */
const DEFAULT_UI_LOCALE: Locale = 'ru'

export function readStoredLocale(storage: Pick<Storage, 'getItem'>): Locale {
  try {
    const stored = storage.getItem(STORAGE_KEY)
    return stored?.trim() ? normalizeLocale(stored) : DEFAULT_UI_LOCALE
  } catch {
    // A throwing localStorage (private mode, disabled storage) must not take
    // the first render down — same hardening as theme.ts.
    return DEFAULT_UI_LOCALE
  }
}

export function createI18nConfigClient(storage: Storage = window.localStorage) {
  return {
    getConfig: (): Promise<StoredConfig> =>
      Promise.resolve({ display: { language: readStoredLocale(storage) } }),

    saveConfig: (config: StoredConfig): Promise<{ ok: boolean }> => {
      const locale = normalizeLocale(config.display?.language)
      try {
        storage.setItem(STORAGE_KEY, localeConfigValue(locale))
      } catch {
        // Best-effort: losing persistence must not stop the choice from
        // applying for this session.
      }
      return Promise.resolve({ ok: true })
    }
  }
}
