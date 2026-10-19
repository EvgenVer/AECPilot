// Русский перевод больших страниц настроек (задача T27).
//
// Их `ru.ts` оставил эти страницы английскими, и слой `ru-fill.ts` (T20.8) довёл
// до русского только обычные экраны. Здесь — остальное, то, что T20.8 отложил
// в Proposals: локальные модели, плагины и вкладка «Коннекторы» (MCP-серверы),
// свои адреса моделей, наборы инструментов, удалённое ядро профиля, страница
// модели, подписи полей конфигурации. Поверхности вне продукта (SPEC §Non-Goals)
// переведены тоже: их строки лежат в том же разделе, что и живые, и пустая
// дыра в русском каталоге хуже лишнего перевода.
//
// Слой лежит над `ru-fill.ts` и под ручными заменами `ru.ts` и `debrand.ts`.
// Тип — их `TranslationOverride<Translations>`: неверный путь ключа или другая
// сигнатура функции — ошибка tsc. Гейт — `ru-coverage.test.ts`.

import type { Translations } from '../../donor/i18n/types'
import type { TranslationOverride } from '../hermes-shared'

// Русские формы числа: 1 инструмент, 2 инструмента, 5 инструментов.
function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}

const tools = (n: number): string =>
  `${n} ${plural(n, 'инструмент', 'инструмента', 'инструментов')}`

export const RU_FILL_PAGES: TranslationOverride<Translations> = {
  connectors: {
    title: 'Подключите свои приложения',
    connect: 'Подключить',
    skip: 'Не сейчас',
    cancel: 'Не ждать',
    retry: 'Повторить',
    grant: 'Подключить снова',
    connected: 'Подключено',
    checking: 'Проверяем ваши приложения…',
    notConnected: 'Не подключено',
    skipped: 'Пропущено',
    disabled: 'Недоступно',
    failed: 'Не удалось подключиться',
    needsAuth: 'Доступ истёк',
    opening: 'Открываем вход…',
    waiting: 'Ждём ваш браузер…',
    timeout: 'Всё ещё ждём разрешения.',
    refresh: 'Обновить состояние',
    connectError: 'Не удалось начать авторизацию. Повторите попытку.',
    connectErrorFor: (app: string) => `Не удалось начать авторизацию для ${app}.`,
    unavailable: 'Коннекторы недоступны в этой сессии.',
    ownerMissing: 'Откройте этот разговор заново, чтобы управлять его подключениями.',
    search: 'Найти приложение',
    empty: 'Подходящих приложений нет',
    disclaimer:
      'Подключение необязательно. Разрешайте только те приложения, которыми должен пользоваться AECPilot.',
    execution: 'Инструменты коннекторов',
    openInBrowser: 'Открыть в браузере',
    setupCancel: 'Отмена',
    authorizedToolsUnavailable: 'Доступ разрешён. Инструменты недоступны.',
    required: 'Обязательно',
    namedAccount: (app: string, alias: string) => `AECPilot назвал этот аккаунт ${app}: ${alias}.`,
    renameAccount: 'Переименовать'
  },
  connectorsPage: {
    title: 'Коннекторы',
    searchPlaceholder: (count: number) =>
      `Поиск среди ${count} ${plural(count, 'приложения', 'приложений', 'приложений')}`,
    filterCategory: 'Категория',
    categoryAll: 'Все категории',
    uncategorised: 'Без категории',
    residencyLocal: 'На этом устройстве',
    segment: {
      available: 'Доступные',
      connected: 'Подключённые',
      off: 'Выключенные'
    },
    group: {
      connected: 'Подключённые',
      connectedNote: 'Сначала сбойные подключения.',
      available: 'Доступные',
      off: 'Выключенные',
      offNote: 'Входы сохраняются.'
    },
    card: {
      kindManaged: 'Управляемый',
      kindCatalog: 'MCP · Каталог',
      kindCustom: 'MCP · Свой',
      kindPlugin: (plugin: string) => `MCP · Плагин ${plugin}`,
      inCatalog: 'В каталоге AECPilot',
      hostedTwin: 'Есть управляемая версия',
      alsoLocal: 'Работает и на этом устройстве',
      open: (name: string) => `Открыть ${name}`,
      turnServerOn: (name: string) => `Включить ${name}`,
      turnServerOff: (name: string) => `Выключить ${name}`,
      state: {
        accessExpired: 'Доступ истёк',
        available: 'Доступно',
        connected: 'Подключено',
        connecting: 'Подключение',
        connectionUnknown: 'Состояние неизвестно',
        couldNotConnect: 'Не удалось подключиться',
        offByYourOrganisation: 'Выключено вашей организацией',
        offForYou: 'Выключено для вас',
        serverConnecting: 'Подключение…',
        serverError: 'Ошибка',
        serverNeedsAuth: 'Нужна аутентификация',
        serverOnUnused: 'Включён, не используется'
      },
      fact: {
        tools: (count: number) => tools(count),
        toolsOff: (count: number) => `${tools(count)} выкл.`,
        toolsOn: (count: number) => `${tools(count)} вкл.`,
        toolsSomeOn: (total: number, on: number) => `${tools(total)}, включено ${on}`
      },
      verb: {
        authenticate: 'Войти',
        connect: 'Подключить',
        install: 'Установить',
        openLogs: 'Открыть журнал',
        reconnect: 'Подключить снова',
        stopWaiting: 'Не ждать',
        tryAgain: 'Повторить',
        turnBackOn: 'Включить снова'
      },
      reason: {
        finishSignIn: 'Завершите вход в браузере.',
        reconnect: 'Подключите снова, чтобы приложение продолжало работать.',
        serverError: 'Сервер отклонил подключение.',
        serverNeedsAuth: 'Войдите, чтобы сервер отвечал.'
      }
    },
    page: {
      loading: 'Читаем каталог и серверы на этом компьютере',
      emptyTitle: 'Здесь пока нет приложений. Добавьте сервер на этом компьютере, чтобы начать.',
      noMatchTitle: 'Подходящих приложений нет',
      noMatchBody: 'Ничего не подходит. Укажите AECPilot свой MCP-сервер, чтобы добавить его.',
      clearSearch: 'Очистить поиск',
      hostedFailedTitle: 'Не удалось связаться с управляемыми приложениями.',
      hostedFailedBody:
        'Серверы на этом компьютере не затронуты и продолжают работать. Ничего не выключено.',
      retry: 'Повторить',
      matchesElsewhere: (count: number) =>
        `Ещё ${count} ${plural(count, 'совпадение', 'совпадения', 'совпадений')} в других группах.`,
      showAllMatches: 'Показать все совпадения',
      segmentNoMatch: (segment: string) =>
        `В разделе «${segment}» совпадений нет, поэтому показаны все.`,
      freeTierNote: 'Подключения остаются на этом компьютере, пока вы не войдёте.',
      signInLine: 'Войдите в Nous, чтобы пользоваться управляемыми приложениями.',
      signIn: 'Войти',
      managedUnavailable: 'Управляемые приложения для этого аккаунта пока недоступны.',
      writeFailed: 'Это изменение не сохранено.',
      refreshFailed: 'Список инструментов не обновлён.',
      disconnectNoAccount:
        'В AECPilot нет аккаунта, который можно здесь отключить. Обновите страницу и повторите.',
      disconnectRefused:
        'Nous сейчас не смог убрать этот вход. Выключите приложение переключателем или повторите позже.'
    },
    add: {
      action: 'Добавить своё',
      title: 'Подключить свой MCP',
      hint: 'одна новая запись в mcp.json на этом устройстве',
      pasteLabel: 'Вставьте команду или фрагмент',
      pasteNoMatch: 'Это не похоже на сервер. Заполните поля ниже.',
      name: 'Название',
      nameTaken: 'Это название уже занято.',
      type: 'Тип',
      command: 'Команда запуска',
      args: 'Аргументы',
      addArg: '+ Добавить аргумент',
      envVars: 'Переменные окружения',
      addEnvVar: '+ Добавить переменную окружения',
      passthrough: 'Проброс переменных окружения',
      addPassthrough: '+ Добавить переменную',
      cwd: 'Рабочая папка',
      headers: 'Заголовки',
      addHeader: '+ Добавить заголовок',
      auth: 'Аутентификация',
      authNone: 'Нет',
      authBearer: 'Bearer-токен',
      valuePlaceholder: 'значение',
      removeRow: 'Убрать эту строку',
      editJson: 'Править mcp.json',
      saveFailed: 'Этот сервер не сохранён.'
    },
    dialog: {
      disconnect: 'Отключить',
      disconnectTitle: (name: string) => `Отключить ${name}?`,
      disconnectBody:
        'AECPilot перестанет действовать от имени этого аккаунта. Подключиться снова можно в любой момент.',
      menuRefreshTools: 'Обновить инструменты',
      moreActions: 'Другие действия',
      removeServerTitle: (name: string) => `Убрать ${name}?`,
      removeServerBody:
        'Запись исчезнет из mcp.json на этом компьютере. Больше ничего не удаляется.',
      appSwitch: (name: string) => `AECPilot может пользоваться ${name}`,
      waysTitle: (name: string) => `Где работает ${name}`,
      wayNotConnected: (name: string) => `Ещё не подключено. Войдите в ${name} в браузере.`,
      wayHosted: 'Управляемый',
      bothOn: (name: string) =>
        `Включены оба, поэтому AECPilot видит каждый инструмент ${name} дважды.`,
      turnOffLocal: 'Выключить локальный сервер',
      providedByPlugin: (plugin: string) => `Предоставлен плагином ${plugin}`,
      openPlugins: 'Открыть вкладку «Плагины»',
      nousLine: 'Приложения Nous привязаны к вашему аккаунту, а не к профилю.',
      rulesReadOnly: 'Сейчас правила изменить нельзя.',
      rulesAppOff: (name: string) => `Включите ${name}, чтобы менять его инструменты.`,
      rulesSignIn: 'Войдите, чтобы менять то, что AECPilot может здесь делать.',
      orgNote: (count: number) => `Ваша организация выключила инструментов: ${count}.`,
      orgLink: 'Открыть администрирование коннекторов',
      connectEnded: 'Вход не завершён.',
      connectOpenAgain: 'Открыть ссылку снова',
      tokensPerCall: 'токенов за вызов',
      usesPerMonth: 'применений за 30 дней',
      advanced: 'Дополнительно',
      advancedHint: 'запись mcp.json и журнал'
    },
    accounts: {
      heading: 'Аккаунты',
      count: (count: number) => `${count} ${plural(count, 'аккаунт', 'аккаунта', 'аккаунтов')}`,
      addAnother: 'Добавить ещё аккаунт',
      aliasLabel: 'Название аккаунта',
      aliasHint: 'Строчные буквы, цифры и дефисы, до 32 знаков. Например work или home.',
      aliasInvalid: 'Используйте строчные буквы, цифры и дефисы, начиная с буквы или цифры.',
      aliasTaken: 'Это название уже занято.',
      add: 'Подключить',
      rename: 'Переименовать',
      renameLabel: (name: string) => `Новое название для ${name}`,
      renameGone: 'Этого аккаунта больше нет: его убрали или заменили при повторном подключении.',
      remove: 'Убрать',
      removeTitle: (app: string, name: string) => `Убрать аккаунт ${name} в ${app}?`,
      removeBody:
        'AECPilot перестанет действовать от имени этого аккаунта. Остальные аккаунты останутся подключены.',
      retiredCount: (count: number) => `заменено: ${count}`,
      status: {
        expired: 'Доступ истёк',
        failed: 'Не удалось подключиться',
        inactive: 'Не активен',
        pending: 'Ждёт входа',
        retired: 'Заменён повторным подключением',
        revoked: 'Доступ отозван'
      }
    },
    tools: {
      title: 'Инструменты',
      notInstalledBody:
        'Установите его на это устройство, чтобы увидеть, какие инструменты он приносит.',
      summaryTitle: (name: string) => `Что AECPilot может делать с ${name}`,
      summaryPreviewTitle: (name: string) =>
        `Что AECPilot сможет делать с ${name} после подключения`,
      summaryCount: (count: number) => tools(count),
      summaryAllTools: 'Все инструменты',
      summaryOther: 'Прочее',
      allToolsSwitch: 'Включить или выключить все инструменты',
      summaryAllOn: 'все включены',
      summaryOff: 'выключено',
      showAllTools: (count: number) => `Показать все: ${tools(count)}`,
      showSummary: 'Показать сводку',
      facetSwitch: (facet: string) => `Включить или выключить инструменты: ${facet}`,
      staleSignIn: 'Войдите, чтобы прочитать свежий список инструментов.',
      searchCountPlaceholder: (count: number) => `Поиск среди инструментов: ${count}`,
      toolList: (name: string) => `Инструменты ${name}`,
      categorySelect: (count: number) =>
        `${count} ${plural(count, 'категория', 'категории', 'категорий')}`,
      showDeprecated: (count: number) => `Показать устаревшие: ${count}`,
      hideDeprecated: (count: number) => `Скрыть устаревшие: ${count}`,
      quickReadOnly: 'Только чтение',
      quickNoDestructive: 'Выключить разрушающие',
      quickEverythingOn: 'Включить всё',
      lockedHint: 'выключено вашей организацией',
      turnToolOn: (tool: string) => `Включить ${tool}`,
      turnToolOff: (tool: string) => `Выключить ${tool}`,
      showDetails: (tool: string) => `Показать, что делает ${tool}`,
      hideDetails: (tool: string) => `Скрыть, что делает ${tool}`,
      noMatch: 'Под эти фильтры не подходит ни один инструмент.',
      loading: 'Читаем список инструментов',
      unavailableLine: 'Список инструментов недоступен.',
      needsAuthTitle: (name: string) => `Войдите в ${name}, чтобы прочитать его инструменты.`,
      needsAuthBody: 'Вход остаётся на этом компьютере. Наружу ничего не уходит.',
      retry: 'Повторить',
      goneTitle: (name: string) => `${name} пропал из каталога.`,
      goneBody:
        'AECPilot больше не может его вызвать. Строка остаётся, пока вы её не уберёте, — ничего не исчезает молча.',
      remove: 'Убрать',
      offTitle: (name: string) => `${name} выключен.`,
      offBody: 'Включите его переключателем выше, чтобы прочитать его инструменты.',
      signedOutTitle: 'Войдите в Nous, чтобы прочитать список инструментов.',
      signedOutBody: 'Ваши серверы на этом компьютере не затронуты.',
      conflictTitle: 'Пока вы правили, кто-то изменил это правило.',
      conflictBody: (theyOff: number, theyOn: number) => {
        const they = [
          theyOff > 0 ? `выключили у вас включённых инструментов: ${theyOff}` : '',
          theyOn > 0 ? `оставили включёнными выключенных вами инструментов: ${theyOn}` : ''
        ].filter(Boolean)

        return `${they.length > 0 ? `Они ${they.join(' и ')}. ` : ''}Ваши правки остаются на экране; ничего не записано.`
      },
      conflictReload: 'Загрузить их версию',
      conflictSave: 'Записать поверх их версии',
      saveFailed: 'Эти правила инструментов не сохранены.',
      footerDirty: (off: number, backOn: number) =>
        `выключено: ${off}, включено снова: ${backOn === 0 ? 'ни одного' : backOn}`,
      discard: 'Отменить',
      save: 'Сохранить изменения',
      saving: 'Сохранение…'
    },
    vocabulary: {
      facetRead: { label: 'Чтение', long: 'Читает данные из этого приложения. Ничего не меняет.' },
      facetWrite: { label: 'Запись', long: 'Создаёт или меняет что-то в этом приложении.' },
      facetDestructive: {
        label: 'Разрушающее',
        long: 'Может безвозвратно удалить что-то в этом приложении.'
      },
      facetUnclassified: {
        label: 'Действие неизвестно',
        long: 'Приложение не сообщило, что делает этот инструмент.'
      },
      hintReadOnly: { label: 'Только чтение', long: 'Инструмент заявляет, что только читает.' },
      hintCreate: { label: 'Создаёт', long: 'Делает что-то новое.' },
      hintUpdate: { label: 'Изменяет', long: 'Меняет то, что уже есть.' },
      hintDelete: { label: 'Удаляет', long: 'Убирает что-то.' },
      hintDestructive: { label: 'Разрушающее', long: 'Сделанное им изменение здесь не отменить.' },
      hintIdempotent: {
        label: 'Повторяемое',
        long: 'Второй запуск даёт тот же результат, что и первый.'
      },
      hintOpenWorld: {
        label: 'Внешнее',
        long: 'Обращается к чему-то за пределами этого приложения.'
      }
    }
  },
  settings: {
    plugins: {
      kinds: { runtime: 'рантайм' }
    },
    // Плоские ключи: `fieldLabels` / `fieldDescriptions` — `Record<string, string>`.
    fieldLabels: {
      'browser.useRealProfile': 'Использовать мой настоящий профиль браузера'
    },
    fieldDescriptions: {
      'browser.useRealProfile':
        'Локальный просмотр использует ваши настоящие входы. AECPilot копирует профиль вашего браузера по умолчанию (куки, входы, настройки) в управляемый снимок и работает с ним через собственный Chromium — ваш живой профиль напрямую не открывается, а копия обновляется с него при каждом запуске. Также позволяет агенту по запросу открыть локальный сеанс с настоящим профилем, даже если настроен облачный браузерный бэкенд. Поддерживаются только браузеры на Chromium (Chrome, Edge, Brave, Brave Origin, Chromium); если браузер по умолчанию на другом движке, будет понятная ошибка. По умолчанию выключено.'
    },
    customEndpoints: {
      active: 'Активен',
      apiKeySet: 'Ключ API задан',
      editTitle: 'Изменить адрес',
      addTitle: 'Добавить адрес',
      fields: {
        name: 'Название',
        providerId: 'Идентификатор провайдера',
        endpointUrl: 'Адрес (URL)',
        defaultModel: 'Модель по умолчанию',
        context: 'Контекст',
        apiKeyNewPlaceholder: 'Оставьте пустым, чтобы сохранить текущий ключ',
        apiKeyPlaceholder: 'Необязательно',
        useNewChats: 'Использовать для новых чатов',
        discoverModels: 'Найти модели'
      },
      test: 'Проверить',
      save: 'Сохранить',
      newEndpoint: 'Новый адрес',
      apiMode: 'Режим API',
      autoDetect: 'Определить автоматически',
      couldNotLoad: 'Не удалось загрузить свои адреса моделей',
      endpointSaved: 'Адрес сохранён.',
      saveFailed: 'Не удалось сохранить',
      endpointReachable: 'Адрес доступен.',
      endpointReachableTransport: (transport: string) =>
        `Адрес доступен (отвечает маршрут ${transport}).`,
      endpointReachableModels: (reachable: string, count: number) =>
        `${reachable} Найдено моделей: ${count}.`,
      endpointValidationFailed: 'Проверка адреса не прошла.',
      validationFailed: 'Проверка не прошла',
      activationFailed: 'Не удалось активировать',
      deleteConfirm: (name: string) => `Удалить ${name}?`,
      deleteFailed: 'Не удалось удалить',
      title: 'Свои адреса моделей',
      deleteEndpoint: 'Удалить адрес',
      emptyDescription: 'Добавьте ниже адрес, совместимый с OpenAI.',
      emptyTitle: 'Своих адресов моделей нет',
      contextPlaceholder: 'Авто'
    },
    model: {
      mainAppliedTitle: 'Основная модель обновлена',
      mainAppliedMessage: (model: string) => `Новые сеансы будут использовать ${model}.`,
      loadFailed: 'Не удалось загрузить модели',
      restartRequired:
        'После обновления этот бэкенд работает на старом коде. Перезапустите его, чтобы загрузить новый.',
      restartBackend: 'Перезапустить бэкенд',
      restartingBackend: 'Перезапуск бэкенда…',
      restartFailed: 'Не удалось перезапустить бэкенд',
      tasks: {
        review: { label: 'Ревью', hint: 'Субагент-рецензент /review' },
        triage_specifier: { label: 'Разбор задач', hint: 'Доработка спецификаций канбана' },
        kanban_decomposer: { label: 'Декомпозиция канбана', hint: 'Разбиение задач' },
        profile_describer: { label: 'Описание профиля', hint: 'Автоописания профилей' }
      }
    },
    toolsets: {
      nousAuthFailedMessage: 'Повторите попытку.',
      nousAuthTryAgain: 'Повторить',
      postSetupOpenLogs: 'Открыть журнал',
      postSetupRunAgain: 'Запустить снова',
      terminalBackend: {
        unavailableTitle: 'Команды терминала недоступны',
        unavailableMessage: (backend: string) =>
          `AECPilot сейчас не может выполнять команды оболочки: ${backend} не готов. Переключитесь на Local или завершите настройку ${backend} и повторите.`,
        openBackendSettings: 'Открыть настройки терминала',
        useLocal: 'Использовать Local',
        switchedToLocal:
          'Команды терминала теперь выполняются локально. Действует для новых сеансов.'
      }
    },
    localModels: {
      connectionChanged: 'Подключение локальных моделей изменилось',
      title: 'Локальные модели',
      runtimeTitle: 'Локальный движок',
      runtimeReady: (backend: string) => `Готов · ${backend}`,
      serverRunning: 'Работает',
      runtimeInstalled: 'Движок llama.cpp установлен',
      runtimeInstalledDetail: (tag: string, backend: string) =>
        `Сборка ${tag}, бэкенд ${backend}. AECPilot сам запускает сервер и следит за ним.`,
      installTitle: 'Установить локальный движок',
      installDetail:
        'Скачивает движок вывода llama.cpp (несколько сотен МБ). Скачанные модели работают целиком на этом компьютере — без аккаунта, ничего не уходит наружу.',
      installAction: 'Установить движок',
      installing: 'Установка движка…',
      installFailed: 'Не удалось установить движок',
      hardwareTitle: 'Этот компьютер',
      hardwareLoading: 'Проверяем оборудование…',
      vram: (label: string) => `Память GPU: ${label}`,
      unifiedMemory: 'Единая память',
      modelsTitle: 'Модели',
      recommended: 'Рекомендуется',
      recommendedReason: {
        'product-default':
          'Модель по умолчанию для этого компьютера, выбранная его производителем.',
        'best-quality-resident':
          'Самая качественная модель, которая целиком работает на вашем GPU на полной скорости. Выбор взвешивает качество и предсказанную скорость на этом оборудовании.',
        'speed-gated-quality':
          'Более качественная модель на этот компьютер помещается, но отвечала бы слишком медленно из-за пропускной способности его памяти — это лучшая модель, которая остаётся быстрой.'
      },
      noRecommendationTitle: 'Для этого компьютера автоматической рекомендации нет',
      noRecommendationDetail:
        'Автоматическая настройка требует проверенной модели, которая целиком работает в памяти GPU или единой памяти на полной скорости. Модель всё равно можно выбрать ниже или найти другие.',
      noRecommendationAction: 'Найти модели',
      downloaded: 'Скачано',
      downloadAction: (size: string) => `Скачать · ${size}`,
      downloadStatusRunning: 'Скачивание',
      downloadEta: (time: string) => `осталось ~${time}`,
      downloadEtaSeconds: (count: number) => `${count} с`,
      downloadEtaMinutes: (count: number) => `${count} мин`,
      downloadEtaHours: (hours: number, minutes: number) =>
        minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`,
      downloadPausedLabel: 'На паузе',
      downloadPauseAction: 'Пауза',
      downloadResumeAction: 'Продолжить',
      downloadDoneToast: (model: string) => `${model} готова.`,
      installDoneToast: 'Локальный движок установлен и готов.',
      quickstartTitle: 'Запустить модель на этом компьютере',
      quickstartDetail: (model: string, size: string) =>
        `Один щелчок настроит всё: локальный движок, ${model} (скачивание ${size}) и модель по умолчанию для новых чатов. Ничего не покидает этот компьютер.`,
      quickstartDetailReady: (model: string) =>
        `Один щелчок сделает ${model} моделью по умолчанию для новых чатов. Всё работает на этом компьютере.`,
      quickstartAction: 'Настроить за меня',
      quickstartConfigure: 'Выберу сам',
      quickstartDoneToast: (model: string) =>
        `${model} настроена — новые чаты работают на этом компьютере.`,
      quickstartFailed: 'Не удалось настроить локальную модель',
      quickstartStageEngine: 'Движок',
      quickstartStageModel: 'Модель',
      quickstartStageFinish: 'Готово',
      activePill: 'По умолчанию',
      updateTitle: 'Доступно обновление движка',
      updateDetail: (next: string, current: string) =>
        `Готова к установке новая сборка llama.cpp (${next}), у вас ${current}. Во время скачивания модели продолжают работать.`,
      updateAction: 'Обновить движок',
      updating: 'Обновление движка…',
      upToDateTitle: 'Движок актуален',
      upToDateDetail: (tag: string, backend: string) => `Работает llama.cpp ${tag} (${backend}).`,
      activeDetail: 'Новые чаты используют эту модель — она загружается при первом сообщении',
      activeNotLoaded: 'Загрузится при первом сообщении',
      loadedPill: 'В памяти',
      placementResident: 'целиком на GPU',
      placementSpilled: 'частично в ОЗУ',
      placementResidentTip:
        'Работает целиком в памяти GPU при этом размере контекста — на полной скорости.',
      placementSpilledTip:
        'Часть модели работает из оперативной памяти — это работает, но медленнее. Более компактная сборка или меньший контекст поместились бы целиком.',
      loadingPill: 'Загрузка…',
      ejectTip: 'Освободить память GPU (загрузится снова при следующем сообщении)',
      ejected: 'Модель выгружена — память GPU освобождена.',
      ejectFailed: 'Не удалось выгрузить модель',
      stopServer: 'Выключить',
      startServer: 'Включить',
      runtimeRunningDetail:
        'Локальный сервер работает. Если выключить его, вся память GPU освободится, а новые чаты не смогут пользоваться локальными моделями, пока вы его не включите.',
      serverStopped: 'Локальный сервер остановлен — память GPU освобождена.',
      serverStarted: 'Локальный сервер работает.',
      serverStopFailed: 'Не удалось остановить локальный сервер',
      serverStartFailed: 'Не удалось запустить локальный сервер',
      activating: 'Запуск…',
      activateFailed: (model: string) => `Не удалось переключиться на ${model}`,
      activateDoneToast: (model: string) => `Новые чаты используют ${model}.`,
      downloadFailed: (model: string) => `Не удалось скачать ${model}`,
      downloadPauseFailed: (model: string) => `Не удалось поставить скачивание ${model} на паузу`,
      downloadResumeFailed: (model: string) => `Не удалось продолжить скачивание ${model}`,
      pillFitsGpu: 'Помещается в ваш GPU',
      pillUsesRam: 'Использует оперативную память',
      pillTooBig: 'Слишком велика для этого компьютера',
      browseTitle: 'Найти другие модели',
      browseHint:
        'Поиск по всему Hugging Face. Скачиваемые здесь модели подбираются под ваш компьютер автоматически, но нами не проверялись.',
      browsePlaceholder: 'Искать модели по названию или автору…',
      browseSearching: 'Ищем на Hugging Face',
      browseListing: 'Читаем файлы модели',
      browseShowFiles: 'Показать файлы',
      browseRefresh: 'Обновить',
      browseDownloads: 'скачиваний',
      browseLikes: 'отметок',
      browseGated: 'нужен вход в Hugging Face',
      browseNoGguf: 'Подходящих файлов модели не найдено.',
      browseFitUnknown: 'Поместится ли — неизвестно',
      browseAlreadyDownloaded: 'Уже скачано.',
      addedByYou: 'Добавлено вами',
      browseDownloadStarted: 'Скачивание {name}',
      browseDownloadAria: 'Скачать {name}',
      sideloadButton: 'Добавить файл модели',
      sideloadTitle: 'Выберите файл модели GGUF',
      sideloadDone: 'Добавлено: {name}.',
      sideloadAlreadyPresent: 'Уже есть в вашей библиотеке.',
      pillFullContext: (max: string) => `Полный контекст ${max}`,
      pillFullContextTip: 'Работает с полным окном контекста модели с самого начала',
      pillUpTo: (max: string) => `Контекст до ${max}`,
      pillGrowsTip: 'Растёт автоматически, когда разговору нужно больше места',
      pillVision: 'Видит изображения',
      deleteAction: 'Удалить модель',
      deleteConfirm: (model: string) => `Удалить ${model} с диска?`,
      deleted: (model: string) => `${model} удалена.`,
      deleteFailed: 'Не удалось удалить'
    }
  },
  skills: {
    plugins: {
      agentTitle: 'Плагины агента',
      agentBlurb:
        'Расширяют агента выбранного профиля — инструменты, хуки, провайдеры. Вступают в силу после перезапуска шлюза.',
      halfDesktop: 'Приложение',
      halfDesktopHint: 'это приложение, одно для всех профилей',
      halfAgent: 'Агент',
      halfAgentIn: (profile: string) => `Агент в ${profile}`,
      defaultProfile: 'AECPilot (по умолчанию)',
      kindAgent: 'Агент',
      kindDesktop: 'Приложение',
      kindBoth: 'Агент + приложение',
      installAgentHere: 'Установить сюда',
      installAgentHereTip: (profile: string) =>
        `Часть для приложения загружена, но часть для агента не установлена в ${profile}. Установите её там.`,
      installAgentHereNoOrigin:
        'Часть для агента не установлена в этом профиле, а сам пакет скопирован вручную (нет записи в каталоге и git-источника), поэтому установить её отсюда нельзя. Скопируйте его папку в профиль или установите заново из Git.',
      desktopHalfPending: 'копируется…',
      desktopHalfPendingTip:
        'В этом пакете есть часть для приложения, которая ещё не скопирована в него. Нажмите «Пересканировать» или перезапустите приложение.',
      desktopHalfRemote: 'недоступно (удалённый бэкенд)',
      desktopHalfRemoteTip:
        'Часть этого пакета для приложения лежит на диске удалённого бэкенда, а приложение не может его прочитать. Чтобы пользоваться ею здесь, запустите «Установить из Git» с адресом репозитория пакета и отметкой цели «Приложение» — часть для приложения будет склонирована на этот компьютер.',
      emptyAll: 'Плагинов пока нет.',
      empty: 'Для этого профиля не установлено плагинов агента.',
      emptyHint: 'Просмотрите каталог ниже и установите проверенный плагин одним щелчком.',
      loadFailed: 'Не удалось загрузить плагины агента',
      toggleFailed: (name: string) => `Не удалось переключить ${name}`,
      toolsetOn: (name: string, profile: string) =>
        `Инструменты агента ${name} включены для ${profile}`,
      toolsetOff: (name: string, profile: string) =>
        `Инструменты агента ${name} выключены для ${profile}`,
      toolsetToggleFailed: (name: string) =>
        `Не удалось переключить инструменты агента ${name}; панель приложения оставлена без изменений`,
      legacyBackend:
        'Этот бэкенд старше переключателей плагинов по ключу — обновите AECPilot, чтобы управлять ими здесь.',
      portableBadge: 'переносимый',
      serverStates: {
        connected: 'подключён',
        app_not_running: 'приложение не запущено',
        hermes_not_connected: 'нет MCP-подключения',
        endpoint_unavailable: 'адрес недоступен',
        no_interactive_session: 'нет интерактивной сессии',
        version_too_old: 'версия слишком старая',
        missing_app: 'приложения нет',
        unsupported_gpu: 'GPU не поддерживается',
        unknown: 'состояние неизвестно'
      },
      catalogTitle: 'Каталог плагинов',
      catalogBrowse: 'Обзор',
      catalogHide: 'Скрыть обзор каталога',
      catalogHint:
        'Нажмите «+ Добавить этому агенту» у любого плагина — проверенные записи ставятся на закреплённом коммите в выбранный профиль. Встроенные плагины «агент + приложение» предлагают обе части.',
      alreadyInstalled: (name: string) => `${name} уже установлен в этом профиле.`,
      catalogProvenance: (sha: string) =>
        `Установлен из каталога AECPilot${sha ? ` на пине ${sha}` : ''}.`,
      pinnedProvenance: (sha: string) =>
        `Закреплён на коммите ${sha}. Обновления отклоняются, пока его не переустановят с новым пином.`,
      pinnedBadge: (sha: string) => `закреплён @ ${sha}`,
      tierOfficial: 'официальный',
      tierCommunity: 'сообщества',
      updateToPin: (sha: string) => `Обновить до ${sha}`,
      updateFailed: (name: string) => `Не удалось обновить ${name}`,
      updated: (name: string) =>
        `${name} обновлён до текущего пина каталога. Перезапустите шлюз, чтобы применить.`,
      updateConsentTitle: (name: string) => `${name} просит больше`,
      updateConsentBody: (name: string, sha: string) =>
        `Новый пин каталога для ${name} (${sha}) добавляет возможности, которых нет в установленной версии. Применяйте, только если им доверяете:`,
      updateConsentConfirm: 'Применить обновление',
      uninstall: 'Удалить',
      uninstallTip: (name: string, profile: string) => `Удалить ${name} из ${profile}`,
      uninstallConfirmTitle: (name: string) => `Удалить ${name}?`,
      uninstallConfirmBody: (name: string, profile: string) =>
        `Файлы плагина будут удалены из профиля ${profile}, вместе с ними — и часть для приложения, если она была. Переустановить можно в любой момент из каталога или из Git.`,
      uninstallFailed: (name: string) => `Не удалось удалить ${name}`,
      uninstalled: (name: string) => `${name} удалён. Перезапустите шлюз, чтобы выгрузить его.`,
      uninstallDesktopTip: (name: string) => `Удалить ${name} из этого приложения`,
      uninstallDesktopConfirmBody: (name: string) =>
        `${name} будет удалён из папки desktop-plugins на этом компьютере и сразу выгружен. Переустановить можно в любой момент из Git или вернув папку на место.`,
      uninstalledDesktop: (name: string) => `${name} удалён.`,
      deepLinkErrorTitle: 'Ссылка установки плагина отклонена',
      deepLinkCatalogInvalidName: 'В ссылке нет названия записи каталога или оно неверно.',
      deepLinkCatalogUnknown: (name: string) =>
        `«${name}» нет в каталоге плагинов AECPilot. Ничего не установлено.`,
      deepLinkCatalogUnavailable:
        'Не удалось загрузить каталог плагинов AECPilot. Проверьте подключение и откройте ссылку снова.',
      settingsToggle: (name: string) => `Настройки: ${name}`,
      settingsForm: {
        save: 'Сохранить настройки',
        saved: (name: string) => `Настройки ${name} сохранены.`,
        saveFailed: (name: string) => `Не удалось сохранить настройки ${name}`,
        required: 'Обязательно',
        secretSet: '•••••••• (задан)',
        secretStoredAs: (env: string) =>
          `Хранится в .env профиля как ${env}, не в config.yaml; оставьте пустым, чтобы сохранить текущее значение.`
      }
    }
  },
  profiles: {
    remoteOverride: {
      menuItem: 'Подключиться к удалённой машине…',
      badge: (host: string) => `Работает на ${host}`,
      title: (profile: string) => `Подключить ${profile} к удалённой машине`,
      description:
        'Сеансы этого профиля будут идти на указанном удалённом AECPilot, а не на этом компьютере.',
      urlLabel: 'Удалённый адрес',
      urlInvalid: 'Введите полный адрес, начинающийся с http:// или https://',
      tokenLabel: 'Токен доступа',
      tokenPlaceholder: 'Вставьте токен удалённой сессии',
      tokenSavedHint: 'Токен уже сохранён. Оставьте пустым, чтобы сохранить его.',
      plainTextOptIn:
        'На этом компьютере нет безопасного хранилища ключей, поэтому токен будет сохранён на диске без шифрования. Всё равно сохранить.',
      collisionWarning: (label: string) =>
        `Шлюз «${label}» уже есть в настройках. Подключение этого профиля — отдельное и его не изменит.`,
      confirmTitle: 'Подключить этот профиль к удалённой машине?',
      confirmNote: (profile: string, host: string) =>
        `Новые чаты в ${profile} будут идти на ${host}. Команды будут выполняться и файлы читаться на той машине, а не на этой. Подключайтесь только к машине, которой доверяете.`,
      confirmBack: 'Назад',
      connect: 'Подключить',
      connecting: 'Подключение…',
      disconnect: 'Убрать удалённое подключение',
      savedTitle: 'Профиль подключён',
      savedMessage: (profile: string, host: string) => `${profile} теперь работает на ${host}`,
      removedTitle: 'Удалённое подключение убрано',
      removedMessage: (profile: string) => `${profile} теперь работает на этом компьютере`,
      removeFailed: 'Не удалось убрать удалённое подключение',
      authFailedTitle: 'Удалённая машина отклонила сохранённый токен',
      authFailedMessage: (profile: string, host: string) =>
        `${host} отказалась принять токен, сохранённый для ${profile}. Возможно, его сменили на удалённой стороне.`,
      updateToken: 'Ввести новый токен…'
    }
  }
}
