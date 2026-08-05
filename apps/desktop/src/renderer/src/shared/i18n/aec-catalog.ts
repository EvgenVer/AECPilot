// Strings for OUR surfaces — the ones the donor has no equivalent of
// (explorer, sources, viewers, wiki, docgen, project screens).
//
// They live in a namespace of their own rather than in the donor's catalog,
// using the same mechanism their plugins use for exactly this reason: a
// contribution ships its own bundles and never edits core `en.ts`. So there is
// no second i18n machinery here — the locale, the fallback chain and the
// re-render on switch are all theirs. Only the strings are ours.

import type { PluginLocaleBundles } from '../../donor/i18n/plugin-i18n'

/** Namespace id for our bundles. Short, and not a plugin id they could ship. */
export const AEC_I18N_NAMESPACE = 'aec'

export const aecLocales: PluginLocaleBundles = {
  en: {
    welcome: {
      tagline: 'An IDE for project documentation',
      create: 'New project',
      createHint: 'A folder (it may be non-empty) → vault structure',
      open: 'Open project',
      openHint: 'A folder with .aecpilot/',
      recentTitle: 'Recent projects',
      recentEmpty:
        'No recent projects yet — they show up here once you create or open the first one.'
    },
    settings: {
      languageLabel: 'Interface language',
      languageHint:
        'Screens carried over from the Hermes desktop are translated as they arrive; anything not yet translated falls back to English.'
    }
  },
  ru: {
    welcome: {
      tagline: 'IDE для проектной документации',
      create: 'Создать проект',
      createHint: 'Папка (может быть непустой) → структура vault',
      open: 'Открыть проект',
      openHint: 'Папка с .aecpilot/',
      recentTitle: 'Недавние проекты',
      recentEmpty:
        'Пока нет недавних проектов — они появятся здесь после первого создания или открытия.'
    },
    settings: {
      languageLabel: 'Язык интерфейса',
      languageHint:
        'Экраны, перенесённые из десктопа Hermes, переводятся по мере переноса; непереведённое показывается по-английски.'
    }
  }
}
