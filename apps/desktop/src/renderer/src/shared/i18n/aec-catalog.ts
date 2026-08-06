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
    common: {
      cancel: 'Cancel',
      close: 'Close',
      loading: 'Loading…',
      refresh: 'Refresh'
    },
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
    project: {
      createTitle: 'New project',
      initTitle: 'Initialize project',
      nameLabel: 'Project name',
      namePlaceholder: 'Site-X',
      folderLabel: 'Project folder (it may be non-empty — only missing files are added)',
      folderUnset: 'not chosen',
      pick: 'Choose folder',
      picking: 'Choosing…',
      create: 'Create',
      creating: 'Creating…',
      init: 'Initialize',
      initializing: 'Initializing…',
      initAnyway: 'Initialize anyway'
    },
    explorer: {
      title: 'Vault',
      empty: 'The vault is empty — the agent and you will fill it.',
      newFile: 'New file',
      newDir: 'New folder',
      rename: 'Rename',
      delete: 'Delete',
      newFilePrompt: 'File name',
      newDirPrompt: 'Folder name',
      renamePrompt: 'New name',
      deleteConfirm: 'Delete this entry?'
    },
    sources: {
      title: 'Sources',
      empty: 'No sources connected — the agent has nothing to read yet.',
      add: 'Connect a folder',
      addAnyway: 'Connect anyway',
      remove: 'Disconnect',
      removeConfirm: 'Disconnect this source? Its files are not touched.',
      unavailable: 'unavailable'
    },
    settings: {
      languageLabel: 'Interface language',
      languageHint:
        'Screens carried over from the Hermes desktop are translated as they arrive; anything not yet translated falls back to English.'
    }
  },
  ru: {
    common: {
      cancel: 'Отмена',
      close: 'Закрыть',
      loading: 'Загрузка…',
      refresh: 'Обновить'
    },
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
    project: {
      createTitle: 'Создать проект',
      initTitle: 'Инициализировать проект',
      nameLabel: 'Название проекта',
      namePlaceholder: 'Объект-X',
      folderLabel: 'Папка проекта (может быть непустой — недостающие файлы будут добавлены)',
      folderUnset: 'не выбрана',
      pick: 'Выбрать папку',
      picking: 'Выбор…',
      create: 'Создать',
      creating: 'Создаю…',
      init: 'Инициализировать',
      initializing: 'Инициализирую…',
      initAnyway: 'Инициализировать всё равно'
    },
    explorer: {
      title: 'Vault',
      empty: 'Vault пуст — его наполните вы и агент.',
      newFile: 'Новый файл',
      newDir: 'Новая папка',
      rename: 'Переименовать',
      delete: 'Удалить',
      newFilePrompt: 'Имя файла',
      newDirPrompt: 'Имя папки',
      renamePrompt: 'Новое имя',
      deleteConfirm: 'Удалить эту запись?'
    },
    sources: {
      title: 'Источники',
      empty: 'Источники не подключены — агенту пока нечего читать.',
      add: 'Подключить папку',
      addAnyway: 'Подключить всё равно',
      remove: 'Отключить',
      removeConfirm: 'Отключить этот источник? Файлы останутся на месте.',
      unavailable: 'недоступен'
    },
    settings: {
      languageLabel: 'Язык интерфейса',
      languageHint:
        'Экраны, перенесённые из десктопа Hermes, переводятся по мере переноса; непереведённое показывается по-английски.'
    }
  }
}
