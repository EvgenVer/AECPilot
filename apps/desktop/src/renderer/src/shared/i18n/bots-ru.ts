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
  // Ядро 0.23.3 (T86): полоска «Ждём коллег» над полем ввода чата специалиста —
  // кому из специалистов передана работа и что с ней.
  waiting: {
    title: 'Ждём коллег',
    queued: 'В очереди',
    claimed: 'Взял в работу',
    working: 'Работает',
    waitingClarify: 'Ждёт вас — ответьте на вопрос',
    waitingApproval: 'Ждёт вас — разрешите или откажите',
    failed: (reason: string) => `Не удалось: ${reason}`,
    reasons: {
      provider_auth_or_access: 'провайдер модели не принял ключ',
      provider_quota_limit: 'у провайдера закончились средства',
      provider_rate_limit: 'провайдер ограничил частоту запросов',
      provider_server_error: 'провайдер недоступен',
      missing_config: 'у специалиста не выбрана модель',
      model_unavailable: 'модель недоступна',
      context_overflow: 'контекст заполнен',
      runtime_offline: 'специалист не в сети',
      queued_expired: 'специалист так и не взял работу',
      delivery_timeout: 'истекло время ожидания',
      agent_blocked: 'специалист заблокирован',
      cancelled: 'отменено',
      unknown: 'неизвестная ошибка'
    },
    unknownOutcome: 'Итог неизвестен',
    open: 'Открыть',
    dismiss: 'Скрыть',
    neverResent:
      'Отсюда ничего не отправляется повторно. Неизвестный итог значит, что специалист мог уже выполнить работу, — откройте его чат, прежде чем просить снова.',
    stale: 'Не удалось обновить — показано последнее известное состояние.'
  },
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
    // Ядро 0.23.3 (T86): шапка списка — заголовок, уведомления, фильтр.
    title: 'Специалисты',
    toastsOn: 'Уведомления о работе включены — нажмите, чтобы выключить',
    toastsOff: 'Уведомления о работе выключены — нажмите, чтобы включить',
    newMenu: 'Создать…',
    filter: 'Фильтр списка',
    filtersActive: (count: number) => `Фильтр списка, активных: ${count}`,
    allGateways: 'Все шлюзы',
    currentGateway: 'Текущий шлюз',
    hidden: 'Скрытые',
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
    openBotChatInNewTab: 'Открыть постоянный чат в новой вкладке',
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
    availableCount: (available: number, total: number) => `Доступно ${available} из ${total}`,
    // Ядро 0.23.3 (T86): строки комнаты, которые донор вынес в `group-chat-locales.ts` —
    // вопросы в комнате, лента событий хода, упоминания, состав, закрепление.
    createAndJoin: 'Создать и войти',
    deleting: 'Удаление…',
    deletedLabel: 'Удалено',
    hideHandle: 'Скрыть полное имя пользователя',
    showHandle: 'Показать полное имя пользователя',
    replyTo: (name: string) => `Ответить: ${name}`,
    ownAnswerPlaceholder: 'Или напишите свой ответ…',
    answerPlaceholder: 'Напишите ответ…',
    sending: 'Отправка…',
    answer: 'Ответить',
    activityUnknown: 'выполнил действие',
    activityBot: 'Специалист',
    activitySlotWait: 'не смог начать — работает слишком много специалистов',
    activityUserQueued: 'Вы отправили сообщение',
    activityUserStopped: 'Вы остановили комнату — оставшиеся ходы приостановлены',
    activityQueued: 'отправил сообщение',
    activityWorking: 'работает…',
    activityReplied: 'ответил',
    activityPassed: 'пропустил ход',
    activityTimedOut: 'не уложился во время',
    activityFailed: 'завершился ошибкой',
    activityCancelled: 'ход прерван новым сообщением',
    activitySettled: 'ход завершён',
    activityCapped: 'ход остановлен по пределу кругов или сообщений',
    activityDelivered: 'прислал запоздалый ответ',
    activityHeld: 'приостановлен вами — упомяните его или попросите продолжить',
    activityStopped: 'остановил комнату — оставшиеся ходы приостановлены',
    sendRouteRequired: 'Для отправки нужны подключение, профиль и номер комнаты',
    savedMessagesUnreadable: 'Не удалось прочитать сохранённые сообщения комнаты',
    savedMessageUnreadable: 'Не удалось прочитать сохранённое сообщение комнаты',
    sendNeedsUpdate: 'Для отправки в комнату нужна новая версия AECPilot; перезапустите AECPilot',
    attachmentTooLarge: (name: string) => `${name}: файл слишком большой (не больше 15 МБ).`,
    attachmentFallback: 'вложение',
    pastedImage: 'вставленное изображение',
    mentionBot: 'Специалист этой комнаты',
    mentionEveryone: 'Все участники комнаты',
    mentionUser: 'Вы — комната ждёт ответа человека',
    createDesc: (max: number) =>
      `Выберите от 2 до ${max} специалистов. Состав для специалистов этого компьютера хранится в профиле каждого; для специалистов с других компьютеров — только в этой комнате.`,
    manageMembersDesc: (max: number, group: string) =>
      `Выберите от 2 до ${max} специалистов для «${group}». Комната, её история и сеансы участников сохранятся.`,
    deleteDesc: (group: string) =>
      `Комната «${group}» уйдёт из списка комнат её специалистов, а общая история комнаты будет очищена. Специалисты и их личные чаты останутся.`,
    memberSizeError: (max: number) => `В комнате должно быть от 2 до ${max} специалистов`,
    manageMembers: 'Участники',
    saveMembers: 'Сохранить участников',
    deleted: (group: string) => `Комната «${group}» удалена`,
    globalCount: (count: number) => `Общих комнат: ${count}`,
    noBots: 'В этой комнате нет специалистов',
    noBotsMatch: (query: string) => `Нет специалистов по запросу «${query}»`,
    createBotFirst: 'Специалистов пока нет — сначала создайте специалиста.',
    startInComposer: () => 'Новые комнаты начинайте в поле ввода комнаты.',
    memberAdded: (bot: string, group: string) => `${bot} добавлен в «${group}»`,
    memberRemoved: (bot: string, group: string) => `${bot} убран из «${group}»`,
    newGroup: 'Новая комната…',
    namePlaceholder: 'Название комнаты (например, «Расчёт плиты»)',
    created: (group: string, count: number) =>
      `Комната «${group}» создана. Специалистов в ней: ${count}.`,
    memberGroups: (groups: string) => `в ${groups}`,
    createAction: 'Создать комнату',
    browserCommentsAdded: (count: number, group: string) =>
      `В «${group}» добавлены комментарии из браузера: ${count}. Проверьте черновик новой ветки перед отправкой.`,
    pinGroup: 'Закрепить наверху',
    unpinGroup: 'Открепить',
    groupPinned: (group: string) => `Комната «${group}» закреплена наверху`,
    groupUnpinned: (group: string) => `Комната «${group}» откреплена`
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
    controlTaken: 'Управление перехватил другой зритель. Только просмотр.',
    // 0.23.0: строка их веб-приложения (HX33) — у нас не видна, но ключ обязателен.
    needsHttps:
      'Экрану специалиста нужно защищённое соединение. Откройте веб-приложение по HTTPS или через SSH-туннель к 127.0.0.1.'
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
  },
  // 0.23.0 (T52): комнаты, которые держит шлюз ядра (`canonical`), и комнаты из
  // специалистов на разных машинах (`crossGateway`). У донора есть свой русский
  // перевод этих строк, но со словами «группа» и «бот»; здесь — наши «комната»
  // и «специалист», как во всём остальном каталоге. Подстановки `{name}`, `{n}`,
  // `{max}`, `{time}`, `{names}`, `{count}`, `{tool}`, `{from}`, `{to}`, `{lead}`,
  // `{connections}` — их, и меняться не могут: их подставляет код донора.
  canonical: {
    roomStopped: 'Комната остановлена',
    roomDisbanded: 'Комната распущена',
    authorityLost: 'Владелец комнаты сменился',
    workLimitReached: 'Комната достигла предела работы',
    turnFailed: 'Ход завершился ошибкой',
    turnCancelled: 'Ход отменён',
    turnDeferred: 'Ход отложен',
    memberUnavailable: 'Участник недоступен',
    members: 'Участники',
    openGroup: 'Открыть комнату',
    loadingGroup: 'Загрузка комнаты…',
    loadingGroups: 'Загрузка комнат шлюза…',
    emptyGroups: 'Комнат шлюза нет.',
    driverUnavailable:
      'Комнату некому вести. Обновите шлюз, которому принадлежит комната, или подключитесь к нему заново.',
    invalidLogCursor: 'Недопустимая позиция в журнале комнаты',
    allowOnce: 'Разрешить один раз',
    deny: 'Отклонить',
    discardUnknown: 'Отбросить работу с неизвестным итогом',
    discardWarning: 'Изменения могли уже произойти. Отказ от работы их не отменяет.',
    confirmDiscard: 'Подтвердить отказ от работы',
    unconfirmedSend:
      'Предыдущая отправка не подтверждена. Повторите её с тем же текстом, прежде чем отправлять другое сообщение.',
    restoredPendingSend:
      'Восстановлена неподтверждённая отправка. Повторите её, прежде чем отправлять другое сообщение.',
    groupMessage: 'Сообщение в комнату',
    attachFiles: 'Прикрепить файлы',
    removeAttachment: 'Убрать вложение',
    uploadFailed: 'Не удалось загрузить файл',
    memberWorking: 'Работает',
    memberQueued: 'В очереди',
    groupWorking: 'Комната работает…',
    statusWorking: 'работает',
    statusStalled: 'нет движения {time}',
    statusReplied: 'ответил',
    statusPassed: 'пропустил',
    statusFailed: 'ошибка',
    statusCancelled: 'отменено',
    statusUnavailable: 'недоступен',
    statusIdle: 'ждёт',
    you: 'Вы',
    roundOf: 'Раунд {n} из {max}',
    round: 'Раунд {n}',
    cycleWorking: 'Работают: {names}',
    cycleSettled: 'Готово — больше никому нечего добавить',
    cycleBounded: 'Достигнут предел раундов',
    cycleMessageCap: 'Достигнут предел сообщений',
    cycleStopped: 'Остановлено',
    typing: '{name} работает…',
    typingTool: '{name} выполняет {tool}…',
    handoff: '{from} попросил {to}',
    replyTo: 'Ответить: {name}',
    replyingTo: 'Ответ для {name}',
    cancelReply: 'Отменить ответ',
    composerPlaceholder: 'Сообщение в комнату — @упомяните, чтобы поручить',
    groupDetails: 'О комнате',
    stopGroup: 'Остановить комнату',
    pendingApproval: '{name} просит разрешения. Решать вам.',
    pendingRetry: 'Ход {name} прервался, не закончившись. Повторить?',
    pendingDiscard: 'Ход {name} мог сделать работу, которая не записана. Отбросить?',
    membersFixed: 'Участники задаются при создании комнаты.',
    rowWorking: 'Работает',
    rowFailed: 'Ошибка участника',
    rowNeedsYou: 'Нужны вы',
    lead: 'Ведущий',
    roomSettings: 'Настройки комнаты',
    purposeLabel: 'Назначение',
    purposePlaceholder: 'Для чего эта комната — одной строкой',
    notesLabel: 'Общие заметки',
    notesPlaceholder: 'Что должен помнить каждый участник',
    deliveryTarget: 'Задания по расписанию могут писать сюда через deliver:',
    scheduledPost: 'По расписанию',
    routingLabel: 'Кто отвечает на сообщение без упоминаний',
    routingEveryone: 'Отвечают все',
    routingLead: 'Ведущий: {name}',
    routingEveryoneHint: 'Каждый участник отвечает по очереди, как сейчас.',
    routingLeadHint:
      'Ведущий решает, кому передать сообщение; @упоминания и @everyone по-прежнему идут прямо адресатам.',
    leadBadge: 'Ведущий',
    assignment: '{lead} поручил: {names}',
    assignmentFallback: '{lead} берёт это на себя',
    routedTo: 'Поручено: {names}',
    routedEveryone: 'Поручено всем',
    routedFallback: 'Не удалось выбрать, кто ответит, поэтому ответят все',
    pausedAfter: 'Пауза после сообщений: {count}',
    continueDiscussion: 'Продолжить',
    continued: 'Продолжено',
    routingAuto: 'Выбирать отвечающих автоматически',
    routingAutoHint:
      'Короткий запрос к модели определяет, кому адресовано сообщение. @упоминания по-прежнему идут прямо тем, кого вы назвали.',
    statusBlocked: 'Заблокировано',
    statusApprovals: 'Ждут разрешения: {count}',
    statusAttention: 'Нужно внимание: {count}',
    stopped: 'Остановка запрошена',
    nothingRunning: 'Новых ответов, которые можно отменить, не было.',
    pendingActionUnconfirmed:
      'Не удалось подтвердить это действие. Обновите комнату, чтобы проверить его состояние.',
    sendRefused: 'Шлюз отклонил это сообщение. Измените его и отправьте снова.',
    sendStopped: 'Остановлено до отправки. Ваше сообщение сохранено.',
    sendMaybe:
      'Сообщение, возможно, уже отправлено. Повтор отправит то же сообщение — дважды оно не появится.',
    sendSettledElsewhere:
      'Другое окно AECPilot уже закончило работу с этим сообщением. Проверьте беседу, прежде чем отправлять его снова.',
    journalLoadFailed:
      'Не удалось загрузить сохранённые сообщения. Отправка приостановлена, чтобы сохранённое сообщение не ушло дважды.',
    journalReload: 'Загрузить ещё раз',
    approvalAction: 'Действие',
    approvalCommand: 'Команда',
    approvalDetailsMissing:
      'Подробностей действия нет. Обновите их, прежде чем разрешать действие.',
    checkingDriver: 'Проверяем, кто ведёт комнату…',
    legacyRoom:
      'Эту комнату вёл сам AECPilot, поэтому на этом шлюзе она продолжиться не может. Начните новую комнату с теми же специалистами: она будет работать и при закрытом AECPilot. Прежние сообщения в неё не копируются.',
    startGatewayGroup: 'Начать новую комнату',
    createRefused: 'Шлюз не смог создать эту комнату.',
    createGroupSize: 'В комнате шлюза должно быть от двух до шести специалистов.',
    createOtherConnection: 'В комнату шлюза можно добавить только специалистов этого подключения.',
    createDuplicateMember:
      'Специалистам комнаты шлюза нужны разные профили и имена; @all и @everyone зарезервированы.',
    legacyRoomElsewhere:
      'Эта комната не может продолжиться здесь: в ней есть специалисты на других компьютерах, а в комнату шлюза можно добавить специалистов только одного подключения. Переключитесь на подключение, где работают эти специалисты, и начните комнату там — или начните новую комнату со специалистами этого подключения. Прежние сообщения в новую комнату не копируются.',
    otherConnections: 'Специалисты на других подключениях: {connections}',
    legacyRoomBlocked:
      'Эту комнату вёл сам AECPilot, поэтому на этом шлюзе она продолжиться не может, а из этих специалистов в нынешнем составе комнату шлюза не собрать (причина ниже). Начните новую комнату и выберите для неё специалистов. Прежние сообщения в неё не копируются.',
    groupsUnsupported:
      'Комнаты здесь не открываются: AECPilot на компьютере этого подключения для них слишком старый. Обновите его там, подключитесь заново и повторите. Ничего не потеряно: прежние сообщения на месте.',
    groupDriverStopped:
      'Сейчас комнаты здесь не открываются: шлюз этого подключения не запустил ведение комнат. Перезапустите или обновите AECPilot на том компьютере и повторите. Ничего не потеряно: прежние сообщения на месте.',
    groupsUnreachable:
      'Не удалось связаться со шлюзом этого подключения, чтобы открыть комнату. Проверьте, что AECPilot там запущен и связь есть, и повторите. Ничего не потеряно: прежние сообщения на месте.',
    earlierMessages:
      'Прежние сообщения, только для чтения. Они остаются в этом AECPilot и в новую комнату не копируются.',
    // Ядро 0.23.3 (T86): причины сбоя хода, отказ от хода и комнаты со специалистами
    // на других компьютерах. Слова наши: «специалист», «комната» (UR27).
    reasonMemberUnavailable: 'Специалист недоступен',
    reasonRuntimeOffline: 'Специалист не в сети',
    reasonQueuedExpired: 'Ход слишком долго ждал в очереди',
    reasonDeliveryTimeout: 'Ответ не пришёл вовремя',
    reasonAgentBlocked: 'Специалист заблокирован',
    reasonCancelled: 'Ход отменён',
    reasonProviderAuth: 'Провайдер отказал в доступе',
    reasonProviderQuota: 'Достигнут лимит у провайдера',
    reasonProviderRate: 'Провайдер получает слишком много запросов',
    reasonProviderServer: 'У провайдера произошла ошибка',
    reasonContextOverflow: 'Разговор слишком длинный для модели',
    reasonMissingConfig: 'Не хватает обязательных настроек',
    reasonModelUnavailable: 'Выбранная модель недоступна',
    reasonTargetScope: 'Специалист не смог получить свои учётные данные',
    reasonSuperseded: 'Ход заменило более новое сообщение',
    reasonDeadline: 'Ход превысил лимит времени',
    reasonPrepareFailed: 'Не удалось запустить специалистов',
    reasonSlotWait: 'Работает слишком много специалистов',
    reasonTargetBusy: 'Специалист занят',
    reasonGatewayRestarted: 'Шлюз специалиста перезапустился',
    turnNoAnswer: 'специалист не ответил вовремя',
    discardStopPending:
      '{name} ещё не подтвердил, что его ход остановлен. Ход сохранён. Попробуйте отказаться от него снова, когда его компьютер будет отвечать.',
    retryBusy: '{name}, возможно, ещё выполняет этот ход. Повторите, когда он закончит.',
    discardPeerUnreachable:
      'Компьютер {name} не отвечает. Ход сохранён. Подключитесь к этому компьютеру заново и попробуйте отказаться от хода снова.',
    discardPeerUpdateRequired:
      'AECPilot на компьютере {name} слишком старый, чтобы подтвердить, что этот ход не начинался. Ход сохранён. Обновите AECPilot на том компьютере и попробуйте отказаться от хода снова.',
    createUncertain:
      'Шлюз не ответил, поэтому эта комната, возможно, уже создана. Повторите, чтобы открыть её. Вторая комната создана не будет.',
    createEnded:
      'Шлюз отклонил эту комнату: возможно, её изменили или удалили в другом месте. Повторите, чтобы создать новую.',
    peerTargetSetup:
      '{connection} пока не может дать специалиста комнате на другом компьютере. {reason}',
    peerSetupUpdate:
      'AECPilot там для этого слишком старый. Обновите AECPilot на том компьютере и проверьте снова.',
    peerSetupApiServer:
      'Его API-сервер выключен. Включите там API-сервер (gateway.platforms.api_server), перезапустите AECPilot на том компьютере и проверьте снова.',
    peerSetupRunStorage:
      'Его API-сервер не может сохранять записи о запусках, поэтому сообщение может выполниться дважды. Проверьте, что AECPilot может писать в свою папку данных на том компьютере, перезапустите там AECPilot и проверьте снова.',
    peerSetupRoomKey:
      'AECPilot там не может создать ключ, который защищает доступ к комнатам. Проверьте, что AECPilot может писать в свою папку данных на том компьютере, перезапустите там AECPilot и проверьте снова.',
    peerSetupApprovals:
      'Подтверждения команд там выключены или их настройки не читаются. Поставьте подтверждения в manual или smart на том компьютере (approvals.mode) и проверьте снова.',
    peerSetupAddress:
      'У него нет адреса, до которого может достучаться компьютер этой комнаты. Задайте gateway.room_link_url на том компьютере, перезапустите там AECPilot и проверьте снова.',
    peerSetupBackground:
      'AECPilot там останавливается вместе со своим окном. Запустите там его шлюз отдельно (hermes gateway run или как службу) и проверьте снова.',
    peerSetupGeneric:
      'Обновите там AECPilot, включите его API-сервер с адресом, до которого может достучаться компьютер этой комнаты (gateway.room_link_url), и не выключайте подтверждения.',
    peerJoinFailed: '{name} не присоединился: {reason}',
    peerJoinUnconfirmed:
      'Не удалось подтвердить, присоединился ли {name}. Проверьте комнату, когда его компьютер станет доступен.',
    peerJoinUnreachable:
      '{name} не присоединился: компьютер этой комнаты не достучался до его компьютера. Проверьте, что его компьютер доступен оттуда и без окна AECPilot, и повторите.',
    peerJoinChanged:
      '{name} не может присоединиться к этой комнате: настройки специалиста на его компьютере изменились после создания комнаты. Чтобы позвать его, создайте новую комнату.',
    readTimedOut:
      'Шлюз не ответил вовремя. Возможно, он ждёт компьютер одного из специалистов. Нажмите «Обновить», чтобы повторить.',
    disbandUnconfirmed:
      'Не удалось подтвердить, что комната закрыта. Компьютер одного из специалистов может спать или быть не в сети. Повторите, когда он снова будет доступен.',
    disbandKept: 'Комната сохранена. {reason}',
    disbandPeerUnreachable:
      'Работа в ней остановлена. Компьютер одного из участников не отвечает. Подключитесь к нему заново и попробуйте распустить комнату снова.',
    disbandStopPending:
      'Не все специалисты этой комнаты подтвердили остановку. Распустите комнату снова, когда подтвердят все. Для ожидающего хода используйте «Повторить» или «Отказаться», если комната их предлагает.',
    disbandMemberHomeUnknown:
      'Комната, возможно, ещё работает, но один из профилей её специалистов больше не настроен на компьютере этой комнаты. Верните этот профиль в hosted_rooms.profiles, чтобы подтвердить его остановку, и распустите комнату снова.',
    disbandInProgress:
      'Не удалось закончить роспуск. Подождите немного, проверьте комнату и при необходимости распустите её снова.',
    disbandRevokeUnsupported:
      'Работа в ней остановлена. Один из участников не может отозвать свой доступ к этой комнате. Обновите AECPilot на его компьютере и попробуйте распустить комнату снова.',
    disbandServiceRequired:
      'Чтобы остановить специалистов и отозвать их доступ, AECPilot должен работать на компьютере этой комнаты. Запустите его там или подключитесь заново и распустите комнату снова.',
    peerStartWithoutRetry: 'Нажмите «Повторить» для этих специалистов в новой комнате.',
    peerStartWithoutKept:
      'Новая комната создана, прежняя сохранена. {reason} Когда будете готовы, распустите прежнюю комнату.',
    createdNotJoined:
      'Комната создана, но {names} ещё не присоединился. Причина показана в комнате; нажмите там «Повторить».',
    peerNotJoinedBadge: 'не присоединился',
    peerOfflineBadge: 'не в сети',
    peerRejoinBadge: 'доступ истёк',
    peerNotJoined: '{name} ещё не присоединился к этой комнате.',
    peerRejoin:
      'Доступ {name} к этой комнате истёк. Чтобы позвать его снова, нажмите «Повторить» в AECPilot, подключённом к его компьютеру.',
    peerAway:
      'Не удалось связаться с компьютером {name}. Следующее сообщение ему попробует подключиться снова.',
    peerRetryFailed:
      'Не удалось снова подключить {name}. Проверьте, что на его компьютере работает AECPilot, и повторите.',
    peerJoinConnect:
      '{name} не присоединился: подключитесь к компьютеру, на котором он работает, и нажмите «Повторить».',
    peerStartWithout: 'Создать новую комнату без {name}',
    peerStartWithoutConfirm:
      'Новая комната создаётся с остальными специалистами. Прежняя закроется, только когда все они присоединятся и каждый участник прежней подтвердит остановку и отзыв доступа. Если любой шаг не удастся, сохранятся обе комнаты. Прежние сообщения не копируются. Повтор после создания создаст ещё одну комнату.'
  },
  crossGateway: {
    desktopDriven:
      'Работает, пока открыт этот AECPilot: специалисты на других машинах отвечают через свои шлюзы, а этот AECPilot передаёт сообщения между ними.',
    groupsOffline: (connection: string, bot: string) =>
      `${connection} не в сети — переподключитесь, чтобы изменить комнаты специалиста ${bot}.`,
    memberOffline: (connection: string, bot: string) =>
      `${connection} не в сети — переподключитесь, чтобы убрать специалиста ${bot}.`,
    memberSaveFailed: (connection: string, bot: string) =>
      `Участники не сохранены: ${connection} не принял изменение для специалиста ${bot}. Ничего не изменено; повторите, когда подключение станет доступно.`,
    memberRollbackFailed: (connection: string, bot: string) =>
      `Участники не сохранены, а уже сделанное изменение для специалиста ${bot} на ${connection} отменить не удалось: там оно может остаться. Комната показывает последнее, что сообщил ${connection}; переподключитесь и проверьте участников.`,
    selectionElsewhere: (connection: string) =>
      `Все эти специалисты работают на ${connection}. Добавьте специалиста этого подключения или переключитесь на ${connection}, чтобы собрать комнату из его специалистов.`,
    // Ядро 0.23.3 (T86): комната на шлюзе со специалистами с других компьютеров.
    gatewayPeer: (owner: string, local = false) =>
      `Работает на ${local ? 'этом компьютере' : owner}, даже когда это окно AECPilot закрыто. Специалистам на других компьютерах передаётся только текст.`,
    pickBots: (max: number) => `Выберите от 2 до ${max} специалистов.`,
    gatewayMembership: 'Состав комнаты хранится вместе с ней на её компьютере.',
    checkingPeers: 'Проверяем, готов ли каждый компьютер этой комнаты…',
    peerCheckFailed: (connection: string, local = false) =>
      `Не удалось проверить ${local ? 'этот компьютер' : connection}. Убедитесь, что там запущен AECPilot, и повторите.`,
    ownerUpdateRequired: (place: string) =>
      `AECPilot на ${place} слишком старый для комнат. Обновите его там и повторите.`,
    ownerCannotSeatPeers: (place: string) =>
      `AECPilot на ${place} пока не может принимать специалистов с других компьютеров. Обновите его там, запустите его шлюз (hermes gateway run) и повторите.`,
    peerRouteMissing:
      'Компьютер одного из выбранных специалистов не подключён. Подключитесь к нему заново и повторите.',
    peerGatewayChanged: (place: string) =>
      `На ${place} теперь работает другая установка AECPilot, не та, откуда этот специалист. Подключитесь заново и повторите.`
  }
}
