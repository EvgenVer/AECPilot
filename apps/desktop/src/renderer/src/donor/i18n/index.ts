/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/index.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
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
