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
    kickoff: 'Привет! Расскажи о себе.'
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
    answerTo: (member: string) => `Ответить @${member}`
  },
  tools: {
    skillsHub: 'Хаб скилов AECPilot',
    filterSkills: 'Фильтр по скилам…',
    searchHub: 'Поиск по хабу (сообщество и известные источники)…',
    noMcpServers: 'MCP-серверов нет ни в настройках, ни в каталоге.'
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
    timesTotal: (count: number) => `, всего ${count} раз(а)`
  }
}
