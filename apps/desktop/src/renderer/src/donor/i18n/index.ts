/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/index.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export { BUNDLED_LOCALES, isBundledLocale, TRANSLATIONS } from './catalog'
export {
  getConfigDisplayLanguage,
  type I18nConfigClient,
  type I18nContextValue,
  I18nProvider,
  useI18n,
  withConfigDisplayLanguage
} from './context'
export {
  DEFAULT_LOCALE,
  isLocale,
  isRtlLocale,
  isSupportedLocaleValue,
  type LanguageOption,
  languageOptions,
  LOCALE_OPTIONS,
  localeConfigValue,
  localeMeta,
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
export {
  $appLocaleVersion,
  type AppLocaleRegistration,
  type AppLocaleSource,
  isRegisteredLocale,
  registerAppLocale,
  resolveTranslations,
  unregisterAppLocaleSource
} from './registry'
export { runtimeTranslations, setRuntimeI18nLocale, translateNow } from './runtime'
export type { BundledLocale, Locale, ToolTitleKey, Translations } from './types'
