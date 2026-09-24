/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/index.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export { TRANSLATIONS } from './catalog'
export {
  getConfigDisplayLanguage,
  type I18nConfigClient,
  type I18nContextValue,
  I18nProvider,
  LOCALE_META,
  useI18n,
  withConfigDisplayLanguage
} from './context'
export {
  DEFAULT_LOCALE,
  isLocale,
  isSupportedLocaleValue,
  LOCALE_OPTIONS,
  localeConfigValue,
  normalizeLocale
} from './languages'
export { LocalizedTabTitle } from './localized-tab-title'
export {
  createPluginI18n,
  type PluginI18n,
  type PluginLocaleBundles,
  type PluginMessages,
  type PluginMessageValue,
  type PluginTranslate,
  registerPluginLocales,
  translatePlugin,
  usePluginI18n
} from './plugin-i18n'
export { setRuntimeI18nLocale, translateNow } from './runtime'
export type { Locale, ToolTitleKey, Translations } from './types'
