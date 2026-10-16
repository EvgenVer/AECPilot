// Строки, которые их русский каталог оставил английскими (задача T20.8).
//
// Их `ru.ts` собран поверх английского: недостающий перевод не падает, а тихо
// показывает английскую строку. Замер на 0.22.2: из 5100 строк 1278 совпадают с
// английскими (после замены имени продукта). Часть — имена и адреса (Telegram,
// https://…), часть — поверхности, которых в продукте нет (биллинг HX2, сейф
// паролей HX24, бесплатный тариф HX3, голос HX19, канал обновлений и MSIX HX4,
// отправка диагностики HX3). Здесь переведено то, что человек видит в обычной
// работе: карточки ошибок в ленте (новинка 0.22 по решению 9), экран загрузки,
// уведомления, композер, предпросмотр, палитра и клавиши, сведения о версии.
// Большие страницы настроек — следующей задачей (TASKS, Proposals).
//
// Слой лежит ПОД ручными заменами `ru.ts` и под `debrand.ts`: имя продукта
// здесь всё равно наше, но пройдёт и через них. Тип — их же
// `TranslationOverride<Translations>`: неверный путь ключа — ошибка tsc.
// Гейт — `ru-coverage.test.ts`.

import type { Translations } from '../../donor/i18n/types'
import type { TranslationOverride } from '../hermes-shared'

const TAB = (n: number) => `Перейти на вкладку ${n}`

// Русские формы числа: 1 сеанс, 2 сеанса, 5 сеансов.
function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const h = n % 100
  if (d === 1 && h !== 11) return one
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few
  return many
}

export const RU_FILL: TranslationOverride<Translations> = {
  externalOpenFailed: {
    title: 'Не удалось открыть ссылку',
    message: 'Для этого адреса не назначен браузер. Скопируйте ссылку и откройте её вручную.',
    copyUrl: 'Скопировать ссылку',
    close: 'Закрыть',
    missing: {
      title: 'Файл не найден',
      message: 'Такого файла нет — его удалили или переместили, или он лежит на другом компьютере.'
    }
  },
  appTour: {
    sessions: {
      title: 'Ваши чаты',
      text: 'Здесь живут все разговоры. Ищите, закрепляйте и открывайте любой из них.'
    },
    composer: {
      title: 'Спрашивайте здесь',
      text: 'Скажите, что нужно сделать. Наберите @, чтобы приложить файл.'
    },
    newSession: {
      title: 'С чистого листа',
      text: 'У нового сеанса свой контекст. Один сеанс — одна задача.'
    },
    model: { title: 'Выбор модели', text: 'Здесь выбирается модель, которая вам отвечает.' },
    modelLocal:
      'Этот компьютер может запустить модель сам: Настройки → Провайдеры → Локальные модели.',
    capabilities: {
      title: 'Возможности',
      text: 'Скилы, инструменты и плагины, которыми пользуется AECPilot. Добавляйте новые здесь.'
    },
    messaging: {
      title: 'Мессенджеры',
      text: 'Пишите AECPilot из Telegram, Slack, Discord и других.'
    },
    rightPane: {
      title: 'Рабочая панель',
      text: 'Справа открываются файлы, терминал, проверка изменений и встроенный браузер.'
    }
  },
  fileMenu: {
    revealUnavailable:
      'Этого пути нет на этом компьютере — он на машине ядра агента. Воспользуйтесь «Показать в дереве файлов».'
  },
  boot: {
    errors: {
      openLogs: 'Открыть журналы',
      gatewayConnectionLostDetail:
        'Переподключаемся. Читать и писать черновик можно и сейчас. Если это затянется, переподключитесь вручную или проверьте настройки подключения.',
      reconnectNow: 'Переподключиться',
      connectionSettings: 'Настройки подключения',
      gatewaySignInRequiredDetail:
        'Войдите снова, чтобы переподключиться. Чаты и настройки в сохранности.',
      signInAgain: 'Войти снова',
      restartHermes: 'Перезапустить AECPilot'
    },
    causes: {
      exitedEarly: 'Фоновая служба AECPilot остановилась сразу после запуска.',
      timedOut: 'Фоновая служба AECPilot не ответила вовремя.',
      permission: 'AECPilot не смог записать в свою папку данных (нет прав доступа).',
      diskFull: 'Диск заполнен, поэтому AECPilot не смог запуститься.',
      portInUse: 'Сетевой порт, нужный AECPilot, занят другой программой.',
      installMissing:
        'Части установки AECPilot не хватает. Выберите «Восстановить установку», чтобы вернуть её.'
    },
    failure: {
      details: 'Подробности',
      bundledReinstallHint:
        'Встроенная установка не может починить себя изнутри приложения — переустановите приложение, чтобы восстановить ядро агента.',
      reinstallApp: 'Переустановить приложение'
    }
  },
  notifications: {
    compressDeferredDone: 'Сжатие контекста завершено',
    errors: {
      rpcOutOfSync: 'Версии приложения и ядра агента не совпадают. Обновите оба.',
      storageFailure:
        'AECPilot не смог сохранить данные в свою папку. Откройте «Обслуживание», чтобы проверить и починить её.',
      codeSkewRestartRequired:
        'AECPilot обновлён, но работает старая версия. Перезапустите его, чтобы завершить обновление.',
      restartHermesFailed: 'Не удалось перезапустить AECPilot'
    },
    actions: {
      openKeys: 'Открыть «Ключи»',
      openGateways: 'Открыть «Подключения»',
      openMaintenance: 'Открыть «Обслуживание»',
      restartHermes: 'Перезапустить AECPilot'
    }
  },
  titlebar: { resetHudLayout: 'Сбросить размер и положение мини-окна' },
  keybinds: {
    clear: 'Очистить',
    actions: {
      'view.cycleSidebarGrouping': 'Сменить группировку сеансов',
      'view.tabSlot.1': TAB(1),
      'view.tabSlot.2': TAB(2),
      'view.tabSlot.3': TAB(3),
      'view.tabSlot.4': TAB(4),
      'view.tabSlot.5': TAB(5),
      'view.tabSlot.6': TAB(6),
      'view.tabSlot.7': TAB(7),
      'view.tabSlot.8': TAB(8),
      'view.tabSlot.9': TAB(9)
    }
  },
  messaging: {
    restartFailedManualDetail:
      'Попробуйте перезапустить ещё раз; если не выйдет, откройте журналы.',
    restartAgain: 'Перезапустить снова',
    openLogs: 'Открыть журналы'
  },
  webhooks: { deliverOptions: { email: 'Эл. почта' } },
  modelAssignment: {
    confirmTitle: 'Предупреждение о выборе модели',
    confirmDetail: 'Подтверждайте, только если этот компромисс вас устраивает.',
    confirmAction: 'Подтвердить',
    declined: 'Смена модели отменена — вы отклонили предупреждение о тарифе с обучением на данных.'
  },
  cron: {
    lastRunFailed: 'Последний запуск не удался:',
    editJob: 'Изменить задание',
    runAgain: 'Запустить снова',
    deliveryLabels: { email: 'Эл. почта' },
    overdueSince: 'Просрочено с:'
  },
  sidebar: {
    storageCorrupt: {
      title: 'База сеансов повреждена',
      guide: 'Как восстановить',
      body: (profiles: string) =>
        `AECPilot не может прочитать всю историю сеансов профиля ${profiles}. Чаты, которых нет в списке, не удалены — повреждён файл, где они хранятся.`,
      action:
        'Закройте AECPilot в этом профиле, затем осмотрите файл, ничего в нём не меняя, или восстановите снимок:'
    },
    projects: { autoDiscovered: 'Найден автоматически' },
    row: { continuationOrigin: 'Автопродолжение — этот разговор сжат и продолжен' }
  },
  composer: {
    hiddenQueued: 'Заметка настройки',
    terminalSelectionMissingTitle: 'Выделение терминала недоступно',
    terminalSelectionMissingBody:
      'Выделите строки терминала заново (Ctrl/Cmd+L) перед отправкой — у этой метки нет исходного текста.',
    queuedTerminalSelectionExpiredBody:
      'Выделение терминала в очереди больше недоступно. Выделите строки заново (Ctrl/Cmd+L) и поставьте сообщение в очередь ещё раз.'
  },
  statusStack: {
    exit: (code: number) => `код выхода ${code}`,
    coding: {
      readOnlyScope:
        'Только просмотр — подготовка, откат и коммит применяются к незафиксированным изменениям',
      worktrees: 'Рабочие деревья'
    }
  },
  updates: {
    connectionSettings: 'Настройки подключения',
    openDownloadPage: 'Открыть страницу загрузки',
    availableBodyRelease: (tag: string) => `Версия ${tag} готова к установке.`,
    releaseAvailable: (tag: string) => `Доступна версия ${tag}.`,
    versionDetailsTitle: 'Сведения о версии',
    versionDetailsBody:
      'Эта установка управляется вне приложения. Обновляйте её тем же способом, каким устанавливали.',
    versionDetailsVersion: 'Версия',
    versionDetailsCommit: 'Коммит',
    versionDetailsBuildOrigin: 'Происхождение сборки',
    versionDetailsDistribution: 'Поставка',
    versionDetailsDistributionDesktop: 'Настольное приложение',
    versionDetailsDistributionDesktopMsix: 'Настольное приложение (MSIX)',
    versionDetailsDistributionDesktopInstaller: 'Настольное приложение (установщик)',
    versionDetailsDistributionSourceInstaller: 'Исходники (скрипт установки)',
    versionDetailsDistributionSource: 'Исходники',
    versionDetailsRuntime: 'Среда выполнения',
    versionDetailsRuntimeEmbedded: 'Встроенная среда',
    versionDetailsRuntimeExternal: 'Внешняя (среда этой машины)',
    versionDetailsInstallId: 'Идентификатор установки',
    versionDetailsUncommittedChanges: 'незафиксированные изменения'
  },
  install: {
    probeErrorDetails: 'Подробности',
    openLogs: 'Открыть журналы',
    setupChoiceDescLocal:
      'Установите ядро агента на этот компьютер или подключитесь к уже работающему.',
    useLocalTitle: 'Ядро агента на этом компьютере',
    useLocalDesc:
      'Ядро агента уже установлено здесь — запустите его одним нажатием. Ничего не скачивается.',
    bundledLocalDesc: 'Ядро агента, встроенное в приложение, — это и есть локальная установка.'
  },
  settings: {
    nav: { providerLocalModels: 'Локальные модели' },
    config: { showOptions: 'Показать параметры' },
    appearance: {
      tipsTitle: 'Подсказки в приложении',
      tipsDesc:
        'Изредка — подсказки от приложения и AECPilot. Каждая показывается один раз. Выключаются сами через 30 дней; можно включить снова.',
      tipsReset: (count: number) =>
        `Снова показать ${count} ${plural(count, 'подсказку', 'подсказки', 'подсказок')}`,
      toursTitle: 'Обзорные экскурсии',
      toursDesc:
        'AECPilot подсвечивает каждый шаг, проводя вас по приложению. Выключаются сами через 30 дней; можно включить снова.',
      vibeHeartsTitle: 'Сердечки',
      vibeHeartsDesc:
        'Всплывающие сердечки, когда вы говорите «спасибо», «молодец» или отправляете сердечко. Не связано с реакциями на сообщения выше.'
    },
    computerUse: {
      accessibility: 'Специальные возможности',
      screenRecording: 'Запись экрана',
      driverHealth: 'Состояние драйвера'
    },
    plugins: {
      installModal: {
        installFromGit: 'Установить из Git',
        reviewRepository: 'Посмотреть репозиторий',
        alreadyInstalled: (name: string) => `${name} уже установлен.`,
        desktopTargetFromPackage:
          'Загружается в приложение из пакета выше — одинаково для всех профилей'
      }
    }
  },
  skills: {
    tabPlugins: 'Плагины',
    officialCatalog: 'Доступны для установки',
    officialPill: 'Официальный',
    hub: {
      installBlockedTitle: (name: string) => `Не удалось установить ${name}`,
      installBlockedMessage: (findings: number, unverified: boolean) =>
        `Проверка безопасности нашла ${findings > 0 ? `${findings} ${plural(findings, 'место', 'места', 'мест')}` : 'рискованные приёмы'}, которые стоит посмотреть${unverified ? ', и скил получен из непроверенного источника' : ''}. Прочитайте отчёт проверки, прежде чем доверять автору.`,
      viewScan: 'Отчёт проверки',
      openLog: 'Открыть журнал'
    }
  },
  profiles: {
    exportMenu: 'Экспорт…',
    status: {
      unread: (count: number) =>
        `${count} ${plural(count, 'непрочитанный сеанс', 'непрочитанных сеанса', 'непрочитанных сеансов')}`,
      needsInput: (count: number) =>
        `${count} ${plural(count, 'сеанс ждёт', 'сеанса ждут', 'сеансов ждут')} вашего ответа`,
      working: (count: number) =>
        `${count} ${plural(count, 'сеанс выполняется', 'сеанса выполняются', 'сеансов выполняются')}`
    }
  },
  onboarding: {
    apiKeyOptions: { local: { short: 'свой сервер' } },
    localModelNamePlaceholder: 'Имя модели (например, command-a-plus-05-2026)',
    free: 'Бесплатно'
  },
  modelPicker: {
    loadingIntoMemory: 'Загружается в память',
    downloading: 'Скачивается',
    localDownloadsHeading: 'Локальные',
    free: 'Бесплатно'
  },
  shell: {
    modelOptions: { ultrafast: 'Сверхбыстро' },
    statusbar: {
      releaseAvailable: (tag: string) => `Доступна версия ${tag}.`,
      gatewayUnavailable: 'модель недоступна',
      cron: 'Расписание',
      systemResources: {
        title: 'Ресурсы системы',
        loading: 'Ресурсы…',
        gpuUtilization: 'Загрузка GPU',
        gpuMemory: 'Память GPU',
        unifiedNote: 'Общая память — GPU и система делят один объём.',
        toggle: 'Ресурсы системы'
      }
    }
  },
  preview: {
    missingTarget: 'Такого пути нет на этом компьютере',
    missingTitle: 'Файла больше нет',
    missingBody: (label: string) =>
      `${label} удалён, перемещён, или его временное место очищено. При следующем запуске эта вкладка не восстановится.`,
    web: {
      annotate: 'Пометки',
      annotateOn: 'Закончить пометки',
      annotateNeedPage: 'Сначала откройте страницу во встроенном браузере.',
      annotateFailed: 'Не удалось включить режим пометок',
      commenting: 'Комментирование',
      addComments: (count: number) =>
        count === 1 ? 'Добавить 1 комментарий' : `Добавить комментарии: ${count}`,
      commentPlaceholder: 'Добавьте комментарий…',
      commentTitle: (n: number) => `Комментарий ${n}`,
      saveComment: 'Сохранить',
      cancelComment: 'Отменить комментарий'
    }
  },
  zones: { newTab: 'Новая вкладка' },
  assistant: {
    thread: {
      loadingLocalModel: (model: string) => `Загружаем ${model} в память`,
      processingPrompt: 'Обрабатываем запрос',
      responseStopped: 'Ответ остановлен',
      errorLayers: {
        auth: 'Проблема со входом',
        billing: 'Закончились средства',
        disk: 'Диск заполнен',
        endpoint: 'Не удаётся связаться с вашим сервером модели',
        gateway: 'В AECPilot произошёл сбой',
        generic: 'AECPilot не смог закончить ответ',
        provider: 'Сервис ИИ вернул ошибку',
        runtime: 'В AECPilot произошёл сбой',
        streaming: 'Ответ оборвался'
      },
      errorLayerBodies: {
        auth: 'Сервис ИИ отклонил вход. Проверьте учётные данные этого провайдера и отправьте сообщение снова.',
        billing:
          'На счёте у этого провайдера закончились средства. Пополните счёт или смените провайдера и отправьте снова.',
        disk: 'Диск заполнен, поэтому AECPilot не смог сохранить разговор. Освободите место и повторите.',
        endpoint:
          'AECPilot не может связаться с вашим сервером модели. Проверьте, что он запущен, и отправьте сообщение снова.',
        gateway:
          'Внутренний сбой AECPilot при начале ответа. Отправьте сообщение снова; если повторяется — скопируйте подробности ошибки.',
        generic:
          'Во время ответа что-то пошло не так. Повторите или скопируйте подробности, если это повторяется.',
        provider:
          'Сервис ИИ не смог выполнить запрос. Повторите чуть позже или смените провайдера.',
        runtime:
          'Внутренний сбой AECPilot при начале ответа. Отправьте сообщение снова; если повторяется — скопируйте подробности ошибки.',
        streaming: 'Связь оборвалась до конца ответа. Повторите, чтобы отправить снова.'
      },
      errorCodes: {
        auth: {
          title: (provider: string) => `${provider} отклонил вход`,
          body: (provider: string) =>
            `Сохранённые учётные данные ${provider} не приняты. Исправьте их в настройках или смените провайдера и отправьте сообщение снова.`
        },
        auth_permanent: {
          title: (provider: string) => `${provider} отклонил вход`,
          body: (provider: string) =>
            `Сохранённые учётные данные ${provider} недействительны или отозваны. Обновите их или смените провайдера и отправьте сообщение снова.`
        },
        billing: {
          title: 'Закончились средства',
          body: (provider: string) =>
            `На счёте ${provider} закончились средства. Пополните счёт или смените провайдера и отправьте снова.`
        },
        rate_limit: {
          title: 'Сервис ИИ занят',
          body: (provider: string) =>
            `${provider} сейчас ограничивает запросы. Подождите минуту и повторите.`
        },
        upstream_rate_limit: {
          title: 'Сервис ИИ занят',
          body: (provider: string) =>
            `${provider} сейчас ограничивает запросы. Подождите минуту и повторите.`
        },
        overloaded: {
          title: 'Сервис ИИ перегружен',
          body: (provider: string) =>
            `У ${provider} сейчас проблемы. Повторите чуть позже или смените провайдера.`
        },
        server_error: {
          title: 'У сервиса ИИ сбой',
          body: (provider: string) =>
            `${provider} вернул ошибку сервера. Повторите чуть позже или смените провайдера.`
        },
        timeout: {
          title: 'Не удалось связаться с сервисом ИИ',
          body: (provider: string) =>
            `${provider} недоступен или не ответил вовремя. Проверьте подключение к интернету и повторите.`
        },
        stream_drop: {
          title: 'Ответ оборвался',
          body: 'Связь оборвалась до конца ответа. Повторите, чтобы отправить снова.'
        },
        no_reply: {
          title: 'Ответ не закончен',
          body: 'AECPilot закончил ход без ответа. Повторите, чтобы отправить снова.'
        },
        upstream_blocked: {
          title: 'Запрос заблокирован сетевым фильтром',
          body: (provider: string) =>
            `Сетевой фильтр или CDN перед ${provider} заблокировал запрос до модели — ключ, скорее всего, в порядке. Задайте заголовок User-Agent в extra_headers провайдера в настройках или смените провайдера и отправьте сообщение снова.`
        },
        ssl_cert_verification: {
          title: 'Не удалось установить защищённое соединение',
          body: (provider: string) =>
            `AECPilot не смог проверить защищённое соединение с ${provider}. Проверьте настройки сети или прокси либо смените провайдера и отправьте сообщение снова.`
        },
        context_overflow: {
          title: 'Разговор слишком длинный',
          body: 'Разговор больше не помещается в модель. Сожмите его или начните новый чат и отправьте снова.'
        },
        payload_too_large: {
          title: 'Сообщение слишком большое',
          body: 'Запрос слишком велик для модели. Сожмите разговор или начните новый чат и отправьте снова.'
        },
        model_not_found: {
          title: 'Модель недоступна',
          body: (provider: string) =>
            `${provider} не предоставляет эту модель вашей учётной записи. Выберите другую модель и отправьте сообщение снова.`
        },
        provider_policy_blocked: {
          title: 'Модель запрещена настройками учётной записи',
          body: (provider: string) =>
            `${provider} не пропустит этот запрос при ваших настройках данных или приватности. Выберите другую модель или смените провайдера.`
        },
        content_policy_blocked: {
          title: 'Сервис ИИ отказался отвечать',
          body: (provider: string) =>
            `${provider} не стал отвечать на это сообщение. Измените его и отправьте снова.`
        },
        format_error: {
          title: 'Сервис ИИ отклонил запрос',
          body: (provider: string) =>
            `${provider} не принял устройство этого запроса. Смените провайдера или скопируйте подробности ошибки.`
        },
        truncated: {
          title: 'Ответ обрезан',
          body: 'Модель остановилась, не закончив. Повторите, чтобы получить полный ответ.'
        },
        invalid_response: {
          title: 'Сервис ИИ прислал нечитаемый ответ',
          body: (provider: string) =>
            `${provider} вернул то, что AECPilot не смог прочитать. Повторите чуть позже.`
        },
        empty_response: {
          title: 'Сервис ИИ прислал пустой ответ',
          body: (provider: string) =>
            `${provider} ничего не вернул на это сообщение. Повторите чуть позже.`
        },
        loop_error: {
          title: 'AECPilot зациклился',
          body: 'Ответ повторял одни и те же шаги, и AECPilot его остановил. Повторите или начните новый чат, если это повторится.'
        },
        SESSION_NOT_OWNED: {
          title: 'Этот чат открыт в другом месте',
          body: 'Этот чат сейчас открыт в другом окне или терминале. Закройте его там и отправьте сообщение снова или начните новый чат здесь.'
        },
        disk_full: {
          title: 'Диск заполнен',
          body: 'Диск заполнен, поэтому AECPilot не смог сохранить разговор. Освободите место и повторите.'
        }
      },
      errorAuthKinds: {
        api_key: {
          title: (provider: string) => `${provider} отклонил ваш API-ключ`,
          body: (provider: string) =>
            `Ключ, сохранённый для ${provider}, недействителен или отозван. Обновите его и повторите.`
        },
        oauth: { title: (provider: string) => `Вход в ${provider} истёк` }
      },
      errorToastTitle: 'AECPilot не смог закончить ответ',
      errorDetails: 'Подробности',
      errorGenericProvider: 'Сервис ИИ',
      errorRetry: 'Повторить',
      errorLimitResets: (time: string) => `Лимит обновится в ${time}`,
      errorRetryAtReset: (time: string) => `Повторить, когда лимит обновится (${time})`,
      errorRetryScheduled: (time: string, wait: string) => `Повтор в ${time} — через ${wait}`,
      errorRetryScheduledCancel: 'Отмена',
      errorStartNewSession: 'Начать новый сеанс',
      errorSwitchProvider: 'Сменить провайдера',
      errorChooseModel: 'Выбрать модель',
      errorCompressConversation: 'Сжать разговор',
      errorCompressFailed: 'Не удалось сжать разговор',
      errorUpdateApiKey: 'Обновить API-ключ',
      errorSignInAgain: (provider: string) => `Войти в ${provider} снова`,
      errorOauthExpired: (provider: string) =>
        `Вход в ${provider} истёк или отозван. Войдите снова, чтобы продолжить разговор.`,
      errorOpenLogs: 'Открыть журналы',
      errorOpenLogsFailed: 'Не удалось открыть папку журналов',
      errorOpenDesktopLogs: 'Открыть журналы приложения',
      errorOpenHermesFolder: 'Открыть папку данных',
      errorOpenHermesFolderFailed: 'Не удалось открыть папку данных',
      errorCopyDiagnostics: 'Скопировать подробности ошибки'
    },
    approval: {
      reconnect: 'Переподключиться',
      openSafetySettings: 'Открыть настройки безопасности',
      commandDetails: 'Подробности команды',
      timedOutSystemLine:
        'Время на подтверждение истекло — команда не выполнена. Попросите AECPilot попробовать снова или увеличьте лимит в Настройки → Безопасность → Время на подтверждение.'
    },
    catalogInstall: {
      envVar: (name: string) => `переменная окружения ${name}`,
      phase: {
        downloading: 'Скачиваем…',
        python_packages: 'Ставим пакеты Python…',
        loading_tools: 'Загружаем инструменты…'
      },
      serverNotConnected: (server: string, reason?: string) =>
        `MCP-сервер ${server} не подключён${reason ? `: ${reason}` : ''}`,
      notEnabled: 'Установлено, но не включено',
      missingEnv: (names: string) => `Задайте ${names}, чтобы закончить настройку`,
      alreadyInstalled: 'Уже установлено; оставлено как есть'
    }
  },
  prompts: { reconnect: 'Переподключиться' },
  desktop: {
    slashCommandIgnoredTitle: 'Команда не отправлена',
    slashCommandIgnoredBody:
      'Слэш-команду нельзя отправить вместе с вложениями. Уберите вложение или отправьте команду отдельно.',
    readOnlyTranscriptTitle: 'Открыто только для чтения',
    readOnlyTranscriptBody:
      'Ни одно подключённое ядро пока не взяло этот старый чат, поэтому он открыт как стенограмма только для чтения. История цела; отправка выключена, пока ядро его не возьмёт.',
    readOnlyTranscriptSendBlocked:
      'Чат открыт как стенограмма только для чтения — отправка выключена.',
    hydrationSyncing: (profile: string) => `Синхронизация ${profile}…`,
    zoomIn: 'Увеличить',
    zoomOut: 'Уменьшить',
    resetZoom: 'Сбросить масштаб',
    pastedContent: 'Вставленный текст',
    pasteAttachFailed: 'Не удалось приложить вставленный текст',
    handoff: { startMessaging: 'Начать переписку' }
  },
  errors: { boundaryDetails: 'Подробности' }
}
