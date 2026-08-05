// The interface-language layer, in the donor's form (task 1.8.6).
//
// Everything mechanical is theirs — `I18nProvider`/`useI18n` for their strings,
// `usePluginI18n` for namespaced bundles, `defineLocale` for partial locales,
// one active locale for both. Ours is only: where the choice is stored
// (config-client.ts), the Russian half of their catalog (ru.ts) and the strings
// for our own surfaces (aec-catalog.ts).
//
// Import the pieces from here rather than reaching into `donor/i18n` directly:
// when the donor is re-copied at a newer SHA, this file is the one place that
// has to still line up.

import { type ReactNode, useState } from 'react'

import { I18nProvider, useI18n } from '../../donor/i18n/context'
import { registerPluginLocales, usePluginI18n } from '../../donor/i18n/plugin-i18n'
import { LOCALE_OPTIONS } from '../../donor/i18n/languages'
import type { Locale } from '../../donor/i18n/types'

import { AEC_I18N_NAMESPACE, aecLocales } from './aec-catalog'
import { createI18nConfigClient, readStoredLocale } from './config-client'

export { useI18n }
export type { Locale }

/** The locales this build offers. SPEC C7 requires en + ru; the rest came with
 * the donor's catalog and are complete, so they are not hidden. */
export const UI_LOCALES = LOCALE_OPTIONS

/** Translator for our own surfaces: `t('welcome.tagline')`. Re-renders on a
 * language switch, like their own `useI18n`. */
export function useAecT(): (key: string, ...args: unknown[]) => string {
  return usePluginI18n(AEC_I18N_NAMESPACE)
}

// Registered at module load, not in an effect: `translatePlugin` is also called
// from non-React code, and a bundle that only exists once a component has
// mounted would make those calls return raw keys.
registerPluginLocales(AEC_I18N_NAMESPACE, aecLocales)

/** Mounts their provider with our storage behind it. `initialLocale` is read
 * synchronously so the first paint is already in the right language — their
 * provider then confirms it through the (async) config client. */
export function AecI18nProvider({ children }: { children: ReactNode }) {
  const [configClient] = useState(() => createI18nConfigClient())

  return (
    <I18nProvider configClient={configClient} initialLocale={readStoredLocale(window.localStorage)}>
      {children}
    </I18nProvider>
  )
}
