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
      retry: 'Retry',
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
      none: 'No project',
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
      deleteConfirm: 'Delete this entry?',
      reveal: 'Show in Explorer',
      search: 'Filter by name',
      noMatches: 'Nothing matches'
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
    index: {
      title: 'Index',
      summary: (indexed: number, total: number) => `${indexed} / ${total}`,
      chunks: (chunks: number) => `${chunks} fragments`,
      stale: (count: number) => `· ${count} stale`,
      staleLong: (count: number) =>
        `${count} file(s) changed since the last run — answers will not see the changes yet.`,
      upToDate: 'The index is up to date.',
      lastRun: (when: string) => `Last run: ${when}`,
      running: (done: number, total: number) => `indexing ${done} / ${total}`,
      runningShort: 'Indexing…',
      run: 'Index',
      runFull: 'Re-read everything',
      failed: (count: number) => `${count} file(s) could not be read — see the run report.`,
      graphTitle: 'Knowledge graph',
      graphEmpty: 'Empty. Ask the agent to add a folder — it costs a model call per fragment.',
      graphSummary: (documents: number, chunks: number) =>
        `${documents} document(s), ${chunks} fragment(s)`,
      graphPartial: (outside: number) => `${outside} document(s) are outside the graph.`,
      graphPending: (documents: number, chunks: number) =>
        `${documents} new document(s) in a marked folder are not in the graph — about ${chunks} fragments of work. They are already searchable.`
    },
    viewer: {
      title: 'Document',
      empty: 'Click a reference in the agent’s answer to open the document at that place.',
      opening: 'Opening the document…',
      failed: (reason: string) => `Could not open the document: ${reason}`,
      pageOf: (page: number, pages: number) => `${page} / ${pages}`,
      previous: 'Previous page',
      next: 'Next page',
      close: 'Close',
      unsupported: 'This format will open in the built-in viewer later.',
      showInExplorer: 'Show in file manager'
    },
    rollback: {
      title: 'Changes',
      loading: 'Loading snapshots…',
      disabled: 'Checkpoints are off — the agent’s edits are not being snapshotted.',
      empty: 'No snapshots yet — the agent has not edited anything.',
      listLabel: 'Snapshots',
      filesLabel: 'Files in the snapshot',
      diffLoading: 'Computing the difference…',
      diffEmpty:
        'No difference — either nothing changed since this snapshot, or the snapshot is gone (the gateway cannot tell these apart).',
      diffHead: (hash: string) => `Changes since snapshot ${hash}`,
      truncated:
        'The gateway cuts the patch at 4000 characters without marking the cut — what is shown below is probably not all of it.',
      binary: 'binary',
      restoreAll: 'Restore everything',
      restoreFile: 'Restore file',
      restore: 'Restore',
      restoredFile: (path: string) => `File ${path} restored.`,
      restoredAll: 'Snapshot restored.',
      restoreFailed: (reason: string) => `Could not restore: ${reason}`,
      noReason: 'no reason given',
      confirmLabel: 'Confirm restore',
      confirmFile: (path: string, hash: string) =>
        `File ${path} will be overwritten with its state from snapshot ${hash}. The current contents are lost.`,
      confirmAll: (hash: string) =>
        `Every file will be overwritten with its state from snapshot ${hash}, and the last turn disappears from the session history. The current contents are lost.`,
      confirmNote:
        'Files created AFTER the snapshot are not deleted by a restore — that is the core’s behaviour.'
    },
    scan: {
      title: 'Sources changed',
      added: (n: number) => `${n} added`,
      changed: (n: number) => `${n} changed`,
      deleted: (n: number) => `${n} deleted`
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
      retry: 'Повторить',
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
      none: 'Проект не открыт',
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
      deleteConfirm: 'Удалить эту запись?',
      reveal: 'Показать в проводнике',
      search: 'Фильтр по имени',
      noMatches: 'Ничего не найдено'
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
    index: {
      title: 'Индекс',
      summary: (indexed: number, total: number) => `${indexed} / ${total}`,
      chunks: (chunks: number) => `${chunks} фрагментов`,
      stale: (count: number) => `· ${count} устарело`,
      staleLong: (count: number) =>
        `${count} файл(ов) изменились с последнего прогона — ответы их пока не видят.`,
      upToDate: 'Индекс в актуальном состоянии.',
      lastRun: (when: string) => `Последний прогон: ${when}`,
      running: (done: number, total: number) => `индексация ${done} / ${total}`,
      runningShort: 'Индексирую…',
      run: 'Проиндексировать',
      runFull: 'Перечитать всё',
      failed: (count: number) => `${count} файл(ов) не прочитались — смотрите отчёт прогона.`,
      graphTitle: 'Граф знаний',
      graphEmpty: 'Пуст. Попросите агента добавить папку — это стоит вызова модели на каждый фрагмент.',
      graphSummary: (documents: number, chunks: number) =>
        `${documents} документ(ов), ${chunks} фрагмент(ов)`,
      graphPartial: (outside: number) => `${outside} документ(ов) вне графа.`,
      graphPending: (documents: number, chunks: number) =>
        `${documents} новых документ(ов) в отмеченной папке не в графе — работы примерно на ${chunks} фрагментов. Поиском они уже находятся.`
    },
    viewer: {
      title: 'Документ',
      empty: 'Кликните ссылку в ответе агента, чтобы открыть документ на нужном месте.',
      opening: 'Открываю документ…',
      failed: (reason: string) => `Не удалось открыть документ: ${reason}`,
      pageOf: (page: number, pages: number) => `${page} / ${pages}`,
      previous: 'Предыдущая страница',
      next: 'Следующая страница',
      close: 'Закрыть',
      unsupported: 'Этот формат откроется во встроенном просмотрщике позже.',
      showInExplorer: 'Показать в проводнике'
    },
    rollback: {
      title: 'Изменения',
      loading: 'Загружаю снимки…',
      disabled: 'Чекпойнты выключены — снимки правок агента не сохраняются.',
      empty: 'Снимков пока нет — агент ещё ничего не правил.',
      listLabel: 'Снимки',
      filesLabel: 'Файлы снимка',
      diffLoading: 'Считаю различия…',
      diffEmpty:
        'Различий нет — либо с этого снимка ничего не менялось, либо самого снимка уже нет (шлюз эти два случая не различает).',
      diffHead: (hash: string) => `Изменения с снимка ${hash}`,
      truncated:
        'Шлюз обрезает патч по 4000 символов и не помечает обрез — ниже, скорее всего, показана не вся разница.',
      binary: 'двоичный',
      restoreAll: 'Восстановить всё',
      restoreFile: 'Восстановить файл',
      restore: 'Восстановить',
      restoredFile: (path: string) => `Файл ${path} восстановлен.`,
      restoredAll: 'Снимок восстановлен.',
      restoreFailed: (reason: string) => `Не удалось восстановить: ${reason}`,
      noReason: 'причина не названа',
      confirmLabel: 'Подтверждение восстановления',
      confirmFile: (path: string, hash: string) =>
        `Файл ${path} будет перезаписан состоянием из снимка ${hash}. Текущее содержимое пропадёт.`,
      confirmAll: (hash: string) =>
        `Все файлы будут перезаписаны состоянием из снимка ${hash}, а последний ход исчезнет из истории сессии. Текущее содержимое пропадёт.`,
      confirmNote:
        'Файлы, созданные ПОСЛЕ снимка, при восстановлении не удаляются — это поведение ядра.'
    },
    scan: {
      title: 'Источники изменились',
      added: (n: number) => `добавлено ${n}`,
      changed: (n: number) => `изменено ${n}`,
      deleted: (n: number) => `удалено ${n}`
    },
    settings: {
      languageLabel: 'Язык интерфейса',
      languageHint:
        'Экраны, перенесённые из десктопа Hermes, переводятся по мере переноса; непереведённое показывается по-английски.'
    }
  }
}
