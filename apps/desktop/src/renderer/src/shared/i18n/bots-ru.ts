// Russian catalog for the roster plugin's own strings (task 3D.5, SPEC C7).
//
// This one is COMPLETE by construction: typing it as their `BotsMessages` on the
// donor side makes a missing key a compile error rather than a promise, and a
// core raise that adds a key to their bundle (3.B4: `sections`,
// `slashCommandsUnsupported`) fails typecheck until the Russian line exists.
// The roster is the first screen a person meets, so a half-Russian roster would
// be the first thing they see. (`ru.ts` is their own full catalog since 3.B4в;
// the bots plugin keeps its bundle apart, so its Russian lives here.)
//
// VOCABULARY IS OURS, NOT A LITERAL TRANSLATION. Their `bot` is our
// «специалист» and their `group chat` is our «комната» — the words SPEC UR27
// uses, the words our own screens already used (`aec-catalog.ts`), and the words
// the `aec-roster` tool says back to the agent («специалиста «Смета» нет в
// роестре»). Translating `bot` as «бот» would give one thing two names: one on
// the screen, another in the answer the agent gets.
//
// Three kinds of literal stay English on purpose, matching the note in their
// file: commands a person can type (`@everyone`, `@all resume`), the tag a
// scheduled job is named by (`[bot:…]`), and raw cron syntax. Translating those
// would print on screen something that does not work when typed.
//
// Russian plurals are avoided rather than computed: «Участников: 5» works for
// every count, «5 участников» would need three forms and a helper in a catalog.

export const botsRu = {
  // 0.21.5 (3.B6): окно создания и правки специалиста вынесло свои строки в
  // каталог — раздел `editor`.
  editor: {
    fullConfigHint:
      'Полная настройка требует более нового шлюза (перезапустите его после обновления AECPilot).',
    liveCapabilities: 'Возможности (применяются сразу — скилы, инструменты, MCP)',
    editSoul: 'SOUL.md (характер и правила общения с другими агентами)',
    remoteCapabilitiesHint:
      'Удалённые возможности требуют более нового приложения. Модель и SOUL ждут сохранения.',
    skillsEnabled: (enabled: number, total: number) => `Скилы (включено ${enabled} из ${total})`,
    toolsetsEnabled: (enabled: number, total: number) =>
      `Наборы инструментов (включено ${enabled} из ${total}; если снять все — вернётся набор по умолчанию)`,
    mcpServers: 'MCP-серверы',
    providerCustom: 'Провайдер (свой)',
    modelCustom: 'Модель (своя)',
    backToDropdowns: '← Вернуться к спискам',
    inheritLaunch: 'Как у профиля запуска',
    enterManually: '✏️ Ввести вручную…',
    gatewayDefault: 'по умолчанию шлюза',
    modelNameExample: 'например, имя модели',
    modelSwitchFailed: 'Не удалось сменить модель',
    newDescription:
      'Специалист со своей памятью, скилами и чатом. Может писать другим вашим агентам.',
    name: 'Имя',
    title: 'Должность',
    description: 'Описание',
    createOn: 'Где создать',
    general: 'Общее',
    capabilities: 'Возможности',
    skills: 'Скилы',
    tools: 'Инструменты',
    cloneFrom: 'Скопировать с профиля',
    freshProfile: 'Новый профиль (встроенные скилы)',
    inheritedModel: 'как у профиля запуска',
    soul: 'SOUL.md (необязательно — заменяет созданный характер)',
    shareKeys: 'Общие ключи и учётные записи с основным профилем',
    // 0.22.2 (T20.7): создание специалиста на другом подключении и специалист
    // без готовой модели.
    shareKeysOn: (target: string) =>
      `Общие ключи и учётные записи с основным профилем на ${target}`,
    shareKeysHint:
      'Подписки, входы через OAuth и API-ключи остаются общими (не копируются), поэтому обновление токена в одном месте не ломает другое. Снимите флажок, чтобы получить отдельную копию.',
    needsModel:
      'Для него пока нет готового провайдера модели, поэтому он пропустил знакомство. Выберите провайдера и модель на вкладке «Возможности».',
    configureModel: 'Настроить модель',
    createEmpty: 'Создать пустым (без встроенных скилов)',
    nameTakenHint: 'Это имя занято — выберите другое, прежде чем настраивать возможности.',
    nameFirstHint:
      'Сначала дайте специалисту имя — черновик профиля создаётся при открытии этой вкладки (и удаляется, если нажать «Отмена»).',
    newerDesktop: 'Скилам нужен более новый AECPilot.',
    newerGateway:
      'Каталогу возможностей нужен более новый шлюз (перезапустите его после обновления AECPilot).',
    emptySkillsHint: 'Отмечено «Создать пустым» — встроенные скилы ставиться не будут.',
    defaultToolsHint:
      'Если отметить все (или ни одного), останется набор инструментов по умолчанию.',
    catalog: 'каталог',
    catalogInstalled: 'каталог · установлен',
    mcpHint:
      'Настроенные серверы копируются с основного профиля; строки каталога — встроенное меню MCP. Строки, которым нужны API-ключи, сначала проходят настройку (учётные данные следуют настройке общих ключей).',
    creating: 'Создаём…',
    createBot: 'Создать специалиста',
    auto: 'Авто',
    autoHint: 'Авто — по имени',
    unlock: 'Открепить',
    lockFace: 'Закрепить облик',
    lockedHint: 'Облик закреплён — при переименовании он не изменится.',
    unlockedHint: 'Облик следует за именем.',
    noImageModel:
      'Нет модели для картинок. Если вы только что её включили (или обновили AECPilot), перезапустите шлюз: Ctrl+K → «Перезапустить шлюз».',
    checkingImage: 'Проверяем генерацию картинок…',
    chooseImage: 'Выбрать картинку…',
    editDescription: (name: string, profile: string) =>
      `Облик и роль специалиста ${name} (${profile}).`,
    nameTaken: (name: string) => `Агент с именем «${name}» уже есть.`,
    nameTakenOn: (name: string, target: string) =>
      `Агент с именем «${name}» уже есть на ${target}.`,
    currentConnection: (name: string) => `${name} (текущее)`,
    remoteHint: (target: string) =>
      `Агент создаётся на ${target} и появляется в роестре как специалист подключения. Чат идёт на ту машину.`,
    cloneFromOn: (target: string) => `Скопировать с профиля (на ${target})`,
    catalogHint: (source: string) =>
      `Каталог с ${source} — неотмеченные скилы после создания будут выключены.`,
    sectionsFailed: (sections: string) => `Не удалось сохранить разделы: ${sections}`,
    updated: (name: string) => `${name}: изменения сохранены`,
    created: (name: string) => `Специалист «${name}» создан`,
    createdOn: (name: string, target: string) => `Специалист «${name}» создан на ${target}`
  },
  roster: {
    search: 'Поиск по специалистам и комнатам',
    searchPlaceholder: 'Поиск по специалистам и комнатам…',
    newBotOrGroup: 'Новый специалист или комната',
    groupChats: 'Комнаты',
    emptyTitle: 'Специалистов пока нет',
    emptyDesc: 'Заведите первого.',
    noMatchQuery: (query: string) => `Под «${query}» никто не подходит`,
    noMatchQueryOn: (query: string, gateway: string) =>
      `Под «${query}» на ${gateway} никто не подходит`,
    noMatchFiltersOn: (gateway: string) => `Под эти фильтры на ${gateway} никто не подходит`,
    noMatchFilters: 'Под эти фильтры никто не подходит.',
    clearFilters: 'Сбросить фильтры',
    allHidden: 'Все специалисты скрыты',
    allHiddenDesc: 'Они продолжают работать, и переписка сохраняется.',
    showHidden: 'Показать скрытых',
    noHiddenMatch: 'Среди скрытых под эти фильтры никто не подходит.',
    hiddenFromRoster: 'Скрыт из списка',
    pinned: 'Закреплённые',
    needsAttention: 'нужно внимание',
    needsInput: 'Ждёт вашего ответа',
    botsAndGroups: 'Специалисты и комнаты',
    botsOnly: 'Только специалисты',
    groupsOnly: 'Только комнаты',
    anyActivity: 'Любая активность',
    activeNow: 'Сейчас работают',
    recentlyActive: 'Работали недавно',
    older: 'Раньше',
    gatewayRemoved: 'Шлюз убран',
    onDemand: 'По требованию',
    ready: 'Готов',
    statusUnknown: 'Состояние неизвестно',
    unavailable: 'Недоступен',
    retryNow: 'Повторить сейчас',
    rosterUnavailable: (reason: string) =>
      `Список недоступен: ${reason}. Если ваш шлюз старше profiles.list, обновите AECPilot и перезапустите шлюз.`,
    waitingForGateway:
      'Ждём подключения к шлюзу… (удалённый шлюз отвечает не сразу; повтор идёт сам)'
  },
  sections: {
    newSection: 'Новый раздел',
    newTitle: 'Новый раздел',
    renameTitle: 'Переименовать раздел',
    nameLabel: 'Название раздела',
    namePlaceholder: 'например, Заказчики',
    create: 'Создать',
    rename: 'Переименовать…',
    moveUp: 'Переместить выше',
    moveDown: 'Переместить ниже',
    unassigned: 'Без раздела',
    options: (name: string) => `Действия с разделом «${name}»`,
    headingTip: 'Перетащите специалистов сюда · двойной щелчок — переименовать',
    emptyHint: 'Перетащите специалистов сюда',
    moveTo: 'Переместить в раздел',
    newSectionEllipsis: 'Новый раздел…',
    removeFromSection: 'Убрать из раздела',
    deleted: (name: string, count: number) =>
      count === 0
        ? `Раздел «${name}» удалён`
        : `Раздел «${name}» удалён — перенесено в «Без раздела»: ${count}`,
    undo: 'Отменить'
  },
  bot: {
    newTitle: 'Новый специалист',
    editTitle: 'Изменить профиль',
    editMenu: 'Изменить…',
    helpPromptPlaceholder: 'В чём этот специалист должен помогать?',
    descriptionHint: 'Оставьте пустым — соберём из имени и описания.',
    newChatWith: 'Новый чат с этим специалистом',
    openBotChat: 'Открыть постоянный чат',
    openingChat: 'Открываем чат…',
    duplicate: 'Дублировать',
    duplicateFailed: 'Не удалось дублировать',
    deleteTitle: 'Удалить специалиста вместе с профилем?',
    removeFromAllGroups: 'Убрать из всех комнат',
    createFirstHint: 'Откройте панель специалистов и нажмите «Новый специалист».',
    createFailed: 'Профиль пока создать не удалось',
    advanced: 'Возможности',
    advancedHint: 'Возможности — модель, скилы, наборы инструментов, SOUL.md',
    advancedFailed: 'Не удалось применить возможности',
    openAnotherChatUnsupported: 'Обновите AECPilot, чтобы открыть ещё один постоянный чат.',
    remoteConnectionsUnsupported:
      'Обновите AECPilot, чтобы говорить со специалистами на других подключениях.',
    chatEmpty: 'Напишите что-нибудь, чтобы начать.',
    kickoff: 'Привет! Расскажи о себе.',
    // 0.21.5 (3.B6)
    pinToTop: 'Закрепить сверху',
    unpin: 'Открепить',
    pinnedToast: (name: string) => `${name}: закреплён сверху`,
    unpinnedToast: (name: string) => `${name}: откреплён`,
    hide: 'Скрыть',
    unhide: 'Показать',
    hiddenToast: (name: string) =>
      `${name} скрыт — скрытых специалистов показывает кнопка с глазом в заголовке`,
    unhiddenToast: (name: string) => `${name} снова в роестре`,
    groupsMenu: (groups: string) => `Группы: ${groups}…`,
    manageGroups: 'Группы…',
    metadataLoadFailed: 'Не удалось загрузить сведения о специалисте',
    loadFailed: 'Не удалось загрузить специалиста',
    groupsLoadFailed: 'Не удалось загрузить группы специалиста',
    thisDevice: 'Этот компьютер',
    attentionFallback: 'Требует внимания',
    attentionProviderAuth: 'Войдите заново для этого профиля',
    attentionQuota: 'Исчерпана квота или баланс',
    attentionMissingConfig: 'Провайдер не настроен — выберите модель в настройках',
    attentionBlocked: 'Специалист заблокирован — см. его последнее сообщение',
    openNeedsUpdateTitle: 'Этот специалист работает на старом AECPilot',
    openNeedsUpdateMessage: (connectionLabel: string) =>
      `Обновите ${connectionLabel} и попробуйте снова.`,
    openUnreachableTitle: 'AECPilot не достучался до компьютера, где работает этот специалист',
    openUnreachableMessage: 'Проверьте, что он включён и в сети, и попробуйте снова.',
    openChatFailedTitle: (botName: string) => `Не удалось открыть чат специалиста ${botName}`,
    openChatFailedMessage: 'Попробуйте снова.',
    openGateways: 'Открыть шлюзы'
  },
  avatar: {
    classicShapes: 'Простые фигуры',
    blobFromName: 'Пятно — рисуется из имени специалиста',
    unlockFollowsName: 'Разблокировать — лицо снова следует за именем',
    randomize: 'Перемешать',
    tabBot: 'Специалист',
    tabGenerate: 'Сгенерировать',
    upload: 'Загрузить',
    tabPet: 'Питомец',
    removeImage: 'Убрать картинку — оставить фигуру',
    removeBackToShape: 'Убрать — вернуться к фигуре',
    describePlaceholder: 'Опишите лицо…',
    describeHint: 'Оставьте пустым — соберём из имени, роли, описания и роестра специалистов.',
    matchTheName: 'Под имя',
    pickPet: 'Выберите питомца лицом этого специалиста.',
    petLoadFailed: 'Этот питомец не загрузился — попробуйте другого.',
    imageTooLarge: 'Картинка слишком большая (максимум 15 МБ).',
    generationFailed: 'Не удалось сгенерировать лицо',
    savedLocally: 'Лицо сохранено на этой машине; на той стороне сохранить не удалось',
    savedLocallyDescriptionFailed: 'Лицо сохранено на этой машине; описание обновить не удалось',
    generate: 'Сгенерировать',
    generating: 'Генерируем…'
  },
  group: {
    newTitle: 'Новая комната',
    manageDesc:
      'Специалист может состоять в нескольких комнатах. Состав комнат синхронизируется на все машины.',
    manageTitle: 'Комнаты специалиста',
    settingsTitle: 'Настройки комнаты',
    settingsDesc:
      'Переименуйте комнату или поставьте ей картинку. Участники и переписка сохранятся.',
    nameLabel: 'Имя комнаты',
    searchToAdd: 'Найдите, кого добавить',
    searchToAddPlaceholder: 'Найдите, кого добавить…',
    removeFromSelection: 'Убрать из выбранных',
    disbandTitle: 'Распустить комнату?',
    deleteTitle: 'Удалить комнату?',
    deleteAction: 'Удалить',
    composerPlaceholder: 'Напишите — вас слышат все в комнате.',
    slashCommandsUnsupported:
      'Слэш-команды в комнате не работают. Откройте чат отдельного специалиста, чтобы ими воспользоваться.',
    attachHint: 'Приложить файлы — их увидит каждый, кто ответит',
    newThread: 'Новая ветка',
    reply: 'Ответить',
    replyInThread: 'Ответить в ветке',
    replyInThreadPlaceholder: 'Ответить в ветке…',
    openThread: 'Открыть ветку',
    collapseThread: 'Свернуть ветку',
    collapseThreadLabel: 'Свернуть эту ветку',
    activity: 'Что происходит',
    noActivityYet: 'В этом ходе пока ничего не происходило.',
    showActivity: 'Показать, что происходит в комнате',
    hideActivity: 'Скрыть, что происходит в комнате',
    stop: 'Стоп',
    stopHint: 'Остановить — прервать того, чей ход, и придержать остальных',
    allHeldStatus: (count: number) => `Приостановлены все участники комнаты: ${count}`,
    heldMembersStatus: (members: string) => `Приостановлены: ${members}`,
    holdReleaseHint: 'Упомяните приостановленного или отправьте @all resume, чтобы продолжить.',
    needsYourInput: 'В этой комнате ждут вашего ответа',
    pictureGenerationFailed: 'Не удалось сгенерировать картинку комнаты',
    nameTaken: (name: string) => `Комната «${name}» уже есть.`,
    memberCount: (count: number) => `Участников: ${count}`,
    settingsHint: (group: string) =>
      `Настройки комнаты — переименовать ${group} или поставить картинку`,
    settingsLabel: (group: string) => `Настройки комнаты ${group}`,
    disbandHint: (group: string) => `Распустить комнату ${group}`,
    disbandLabel: (group: string) => `Распустить ${group}`,
    disbandAction: 'Распустить',
    disbanding: 'Распускаем…',
    disbandDone: 'Распущена',
    disbanded: (group: string) => `Комната «${group}» распущена`,
    disbandDescPrefix: 'Это распустит комнату ',
    disbandDescSuffix: (count: number) =>
      ` — объединение специалистов (${count}) пропадёт, общий журнал комнаты будет очищен. Сами специалисты и их сессии в этой комнате сохранятся.`,
    stopped: (group: string) =>
      `Комната ${group} остановлена — оставшиеся ходы придержаны до продолжения`,
    removeAttachment: 'Убрать вложение',
    threadFallback: 'Ветка',
    replyCount: (replies: number) => `Ответов: ${replies}`,
    dropToThread: 'Отпустите, чтобы приложить к ответу в ветке',
    dropToRoom: 'Отпустите, чтобы приложить — увидит каждый, кто ответит',
    waitingForAnswer: 'Ждём вашего ответа…',
    memberThinking: (name: string) => `${name} думает…`,
    roomWorking: 'Комната работает…',
    messageRoom: (group: string) => `Написать в ${group}`,
    newThreadPlaceholder: (group: string) =>
      `Новая ветка в ${group}… (@имя — конкретному, @everyone — всем)`,
    everyoneMeta: 'Все в комнате',
    commandApproval: 'подтверждение команды',
    answerFailed: (handle: string, error: string) =>
      `Не удалось отправить ответ @${handle}: ${error}`,
    wantsToRunCommand: (handle: string) => `@${handle} хочет выполнить команду:`,
    asks: (handle: string) => `@${handle} спрашивает:`,
    answerTo: (member: string) => `Ответить @${member}`,
    // 0.21.5 (3.B6)
    holdDetection: 'Распознавать просьбы подождать',
    holdDetectionHint:
      'Сообщение в комнате может поставить участника на паузу, пока его снова не упомянут.',
    compressHistory: 'Сжать историю',
    compressHistoryHint: (member: string) =>
      `Сжать скрытую историю комнаты у ${member}, чтобы он перестал отвечать пустыми сообщениями`,
    compressing: (member: string) => `Сжимаем историю комнаты у ${member}…`,
    compressDone: (member: string, compressed: number, detail: string) =>
      `${member}: сжато сессий комнаты — ${compressed}${detail ? ` (${detail})` : ''}`,
    compressNothing: (member: string) => `У ${member} нечего сжимать — сессии комнаты ещё нет`,
    compressFailed: (member: string, error: string) =>
      `Не удалось сжать историю комнаты у ${member}: ${error}`,
    noMembersToSend: (group: string) =>
      `В комнате «${group}» некому отправить — добавьте специалиста или откройте комнату заново, если участники ещё загружаются.`,
    you: 'Вы',
    availableCount: (available: number, total: number) => `Доступно ${available} из ${total}`
  },
  tools: {
    skillsHub: 'Хаб скилов AECPilot',
    filterSkills: 'Фильтр по скилам…',
    searchHub: 'Поиск по хабу (сообщество и известные источники)…',
    noMcpServers: 'MCP-серверов нет ни в настройках, ни в каталоге.',
    // 0.21.5 (3.B6)
    installHint: (name: string) => `Установить «${name}» и добавить в список выше`,
    installed: (name: string) => `Скил «${name}» установлен`,
    installFailed: (name: string) => `Не удалось установить «${name}»`,
    searchHint: 'Ищем в сообществе и известных источниках — это может занять около 10 секунд…',
    resizeHint: 'Потяните за угол, чтобы изменить размер.',
    addServerFailed: 'Не удалось добавить сервер',
    noTarget: 'Не выбран профиль',
    setKeyFailed: (key: string) => `Не удалось задать ${key}`,
    configured: (name: string) => `${name} настроен`,
    authenticated: (name: string) => `${name}: вход выполнен`,
    testFailed: 'После настройки проверка сервера не прошла',
    completeSignIn: 'Завершите вход в браузере…',
    needsSetup: (keys: string) =>
      `нужна настройка (${keys}) — перезапустите шлюз, чтобы настроить в приложении`,
    setUpDone: 'настроено ✓',
    saveTest: 'Сохранить и проверить',
    authorizing: 'Выполняем вход…',
    working: 'Работаем…',
    setupFailed: 'Настройка не удалась',
    signIn: 'Войти…',
    setUp: 'Настроить…'
  },
  // 0.21.5 (3.B6): «экран» специалиста (Bot Desktop). У нас просмотрщик не
  // установлен (D-145, SPEC C3), но строки нужны — раздел должен быть полным.
  screen: {
    title: 'Экран',
    menu: 'Открыть экран',
    unsupportedTitle: 'На этом компьютере экрана специалиста нет',
    unsupportedBody:
      'Экраны специалистов работают на шлюзах под Linux. Этот специалист пользуется экраном самого компьютера.',
    notInstalledTitle: 'Нет пакетов для экрана',
    notInstalledBody:
      'Чтобы у специалиста был экран, на компьютере шлюза нужны TigerVNC и ядро Xfce. Выполните там:',
    installHint:
      'Выполняется на компьютере шлюза от пользователя, под которым работает AECPilot; пароль sudo спросят один раз, через AECPilot.',
    install: 'Установить на компьютер шлюза',
    installing: 'Устанавливаем…',
    installCancelled: 'Установка отменена: пароль sudo не введён.',
    installFailed:
      'Установка не удалась. Прочитайте журнал выше или выполните команду на компьютере шлюза сами.',
    noPackageManager:
      'На компьютере шлюза нет поддерживаемого менеджера пакетов (apt, dnf, pacman).',
    portalTitle: 'Экран',
    portalOpen: 'Открыть',
    heroStopped: 'Экран выключен',
    heroNotInstalled: 'На этом компьютере не установлен',
    heroConnecting: 'Проверяем экран…',
    heroStale: 'Последний снимок — экран недоступен',
    heroSuppressed: 'Скрыт, пока управление у другого',
    heroOpenLive: 'Смотреть вживую',
    heroInstall: 'Установить',
    heroStart: 'Включить',
    portalWatching: 'Вживую · управляет специалист',
    portalYouControl: 'Вживую · управляете вы',
    portalOtherControls: 'Вживую · управляет другой зритель',
    portalStopped: 'Выключен',
    portalNotInstalled: 'Не установлен на компьютере шлюза',
    portalUnsupported: 'Недоступен на этом компьютере',
    portalUnavailable: 'Чтобы открыть экран, обновите AECPilot у специалиста',
    // 0.22.2 (T20.7): облачные специалисты и образ песочницы. Экран — HX28,
    // поверхность мёртвая, но каталог обязан быть полным (см. шапку).
    portalUnavailableManaged: 'В этой облачной версии экран пока недоступен',
    managedNotIncludedTitle: 'У этого специалиста нет экрана',
    managedNotIncludedBody:
      'В облачной версии экран есть у специалистов с памятью от 8 ГБ. На специалиста поменьше его не установить.',
    unavailableTitle: 'Экрану нужен более новый AECPilot',
    autoOpenMenu: 'Открывать экран, когда специалист им пользуется',
    autoOpenOnToast: (name: string) =>
      `Экран специалиста ${name} откроется, когда он начнёт работать на своём рабочем столе`,
    autoOpenOffToast: (name: string) =>
      `Экран специалиста ${name} останется закрытым, пока вы его не откроете`,
    stoppedTitle: 'Экран выключен',
    stoppedBody:
      'Включите рабочий стол специалиста, чтобы видеть, что он делает, и перехватить управление, когда нужно.',
    placementSandbox: (backend: string) =>
      `Экран работает внутри песочницы ${backend}, вместе с терминалом`,
    imageSwitchTitle: 'Доступен новый образ песочницы',
    imageSwitchBody: (current: string, target: string) =>
      `Ваша песочница всё ещё работает на ${current}, где нет рабочего стола. Переход на ${target} пересоздаст контейнер, когда специалист в следующий раз откроет терминал: файлы в /root и /workspace останутся на этом компьютере, пакеты, установленные внутри контейнера, поставятся заново по мере надобности.`,
    imageSwitchApprove: 'Сменить образ',
    imageSwitchKeep: 'Оставить текущий образ',
    start: 'Включить экран',
    attaching: 'Подключаемся к экрану…',
    streamLost: 'Трансляция экрана прервалась',
    reconnect: 'Подключиться снова',
    takeOver: 'Перехватить управление',
    handBack: 'Вернуть управление',
    handBackForce: 'Вернуть управление (принудительно)',
    handBackForceHint:
      'Снять управление, которое держит зритель, которого уже нет, — например, после перезагрузки окна.',
    openNeedsUpdate: 'Чтобы открывать экраны специалистов, обновите AECPilot.',
    youControl: 'Управляете вы',
    otherControls: 'Управляет другой зритель',
    agentControls: 'Управляет специалист',
    controlTaken: 'Управление перехватил другой зритель. Только просмотр.'
  },
  cron: {
    filterHint:
      'В этом профиле есть расписания, но ни одно не помечено этим специалистом. Назовите задачу «[bot:<имя>] …», чтобы она показалась здесь, или смотрите их ниже, в разделе расписаний.',
    needsRosterFirst: 'Сначала специалист должен появиться в списке.',
    staleNotice: 'Не удалось обновить расписания. Показан последний известный список.',
    readFailure: 'Список, скорее всего, на месте — не удалось его прочитать, а не удалить.',
    createDesc: (bot: string) =>
      `Повторяющаяся задача, которую ${bot} выполняет по расписанию. Результат приходит в его переписку.`,
    instruction: 'Что сделать',
    whenToRun: 'Когда выполнять',
    dayOfMonth: 'День месяца',
    sendResultsTo: 'Куда отправить результат',
    runHistoryOnly: 'Только в историю запусков',
    botChatTarget: (bot: string) => `В чат ${bot} (специалист отвечает)`,
    continuity:
      'Продолжение: каждый запуск видит результат предыдущего (не повторяется, продолжает с места остановки)',
    onceIn: (when: string) => `Один раз (${when})`,
    everyNDays: (days: number) => `Каждые ${days} дн.`,
    everyNHours: (hours: number) => `Каждые ${hours} ч.`,
    everyNMinutes: (minutes: number) => `Каждые ${minutes} мин.`,
    freqOnce: 'Один раз, через…',
    freqHourly: 'Каждый час',
    freqDaily: 'Каждый день',
    freqWeekdays: 'По будням',
    freqWeekly: 'Каждую неделю',
    freqMonthly: 'Каждый месяц',
    freqInterval: 'Интервал',
    freqAdvanced: 'Своё расписание…',
    unitMinutes: 'мин.',
    unitHours: 'ч.',
    unitDays: 'дн.',
    runsOnce: (count: number, unit: string) => `Один раз, через ${count} ${unit}`,
    runsHourly: 'Каждый час, в начале часа',
    runsDaily: (time: string) => `Каждый день в ${time}`,
    runsWeekdays: (time: string) => `С понедельника по пятницу в ${time}`,
    runsWeekly: (day: string, time: string) => `Каждую неделю: ${day} в ${time}`,
    runsMonthly: (day: string, time: string) => `Каждый месяц, ${day}-го числа в ${time}`,
    runsInterval: (count: number, unit: string) => `Каждые ${count} ${unit}`,
    runsRaw: 'Своё расписание — every Nm/Nh/Nd или cron из 5 полей',
    timesTotal: (count: number) => `, всего ${count} раз(а)`,
    // 0.21.5 (3.B6)
    untitled: 'Задание без названия',
    nameNul: 'В названии задания не может быть символа NUL (U+0000).',
    instructionNul: 'В инструкции задания не может быть символа NUL (U+0000).',
    minutesFromNow: 'мин. от текущего момента',
    hoursFromNow: 'ч от текущего момента',
    daysFromNow: 'дн. от текущего момента',
    stopAfter: 'Остановить после',
    runsHint: 'запусков (пусто — без ограничения)',
    detailDescription: 'Что делает это задание и когда оно запустится в следующий раз.',
    status: 'Состояние',
    active: 'Работает',
    paused: 'На паузе',
    schedule: 'Расписание',
    rawSchedule: 'Расписание (как записано)',
    repeat: 'Повторы',
    nextRun: 'Следующий запуск',
    overdueSince: 'Просрочено с',
    lastRun: 'Последний запуск',
    lastResult: 'Последний результат',
    workdir: 'Рабочая папка',
    succeeded: 'Успешно',
    failed: 'С ошибкой',
    deliveryFailed: 'Выполнено, но доставить результат не удалось',
    blockedConfig: 'Заблокировано настройками (не запускалось)',
    legacyUnsafe:
      'Остановлено ради безопасности: удалите это старое задание и создайте его заново, прежде чем запускать.'
  }
}
