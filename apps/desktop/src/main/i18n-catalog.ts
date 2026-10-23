// Каталог строк главного процесса: то, что видит человек (задача T27, часть 2).
//
// Два дерева с одним набором ключей — `ru` (источник правды: тексты дословно те,
// что были в коде до каталога) и `en`. Тип `en` выведен из `ru`, поэтому ключ или
// число параметров, пропущенные в английском, не соберутся; `i18n-catalog.test.ts`
// дополнительно сверяет подстановки и то, что английский не остался русским.
//
// Сюда НЕ идут: строки журнала, сообщения разработчику и всё, что читает модель
// (промпты, SOUL, примечания инструментов) — см. шапку `i18n.ts`.
// Строка с подстановкой — функция: порядок слов в двух языках разный.

const ru = {
  // --- Общие ответы окну ----------------------------------------------------
  'common.noProject': 'Нет открытого проекта',
  'common.noProjectLc': 'нет открытого проекта',
  'common.sourceNotFound': 'Источник не найден',
  'common.fileNotFound': 'Файл не найден',
  'common.fileNoAccess': 'Нет доступа к файлу',
  'common.notAFile': 'Это не файл',
  'common.notAFileDot': 'Это не файл.',
  'common.folderNotDocument': 'Это папка, а не документ',
  'common.fileTooLargeToView': 'Файл слишком велик для просмотра',
  'common.indexingAlreadyRunning': 'Индексация уже идёт',
  'common.noGatewayLc': 'нет связи со шлюзом',
  'common.emptyPath': 'Пустой путь',
  'common.noCoreConnectionLc': 'нет связи с ядром',
  'licenses.noticesMissing':
    'Файла лицензий нет: он собирается вместе с установщиком и лежит в папке установленной программы',

  // --- Диалоги и меню --------------------------------------------------------
  'tray.show': 'Показать AECPilot',
  'tray.quit': 'Выйти из AECPilot',
  'remoteProject.folderRejected': (reason: string) =>
    `Сервер не принял папку как рабочую: ${reason}`,
  'remoteProject.serverDidNotOpen':
    'Сервер не подтвердил открытие проекта за две минуты. Проверьте, что сервер AECPilot запущен (значок в трее на сервере), и попробуйте снова.',
  'remoteProject.scanOnServer':
    'Сканирует сервер по своему расписанию — в том числе при закрытом приложении.',
  'remoteProject.requestFailed': (reason: string) =>
    `Не удалось передать просьбу серверу: ${reason}`,
  'remoteProject.serverDidNotAnswer':
    'Сервер не ответил на просьбу за полторы минуты. Проверьте, что сервер AECPilot запущен, и попробуйте снова.',
  'remoteProject.wholeIndexOnly':
    'На сервере индексируется весь проект целиком: выборочная индексация и перестройка — только на самом сервере.',
  'connection.clientHasNoCore':
    'Это установка «только приложение»: своего ядра здесь нет. Подключитесь к серверу.',
  'serverTray.tooltip': 'AECPilot — сервер',
  'serverTray.running': 'Сервер AECPilot работает',
  'serverTray.starting': 'Сервер AECPilot запускается…',
  'serverTray.failed': 'Сервер AECPilot не запустился — см. журнал',
  'serverTray.copyToken': 'Скопировать токен подключения',
  'serverTray.newToken': 'Выдать новый токен',
  'serverTray.newTokenConfirm':
    'Старый токен перестанет работать, и все подключённые клиенты отключатся. Каждому понадобится ввести новый.',
  'serverTray.newTokenButton': 'Выдать новый',
  'serverTray.cancel': 'Отмена',
  'serverTray.copied': 'Токен скопирован. Вставьте его в окне подключения на клиенте.',
  'serverTray.quit': 'Остановить сервер',
  'serverTray.keys': 'Ключи моделей…',
  'serverKeys.title': 'AECPilot — ключи моделей',
  'serverKeys.intro':
    'Ключи провайдеров для ядра и индексации на этом сервере. Хранятся зашифрованными здесь же и по сети не передаются; сохранённое значение окно не показывает.',
  'serverKeys.stored': 'сохранён',
  'serverKeys.notStored': 'не задан',
  'serverKeys.envWins': 'задан в .env профиля — значение оттуда сильнее',
  'serverKeys.name': 'Переменная',
  'serverKeys.value': 'Ключ',
  'serverKeys.save': 'Сохранить',
  'serverKeys.remove': 'Удалить',
  'serverKeys.close': 'Закрыть',
  'serverKeys.saving': 'Сохраняю и перезапускаю ядро…',
  'serverKeys.saved': 'Ключ сохранён, ядро перезапущено.',
  'serverKeys.removed': 'Ключ удалён, ядро перезапущено.',
  'serverKeys.restartFailed': (reason: string) =>
    `Ключ сохранён, но ядро не перезапустилось: ${reason}`,
  'serverKeys.badName':
    'Имя переменной — заглавные латинские буквы, цифры и «_», например GEMINI_API_KEY; системные переменные (PATH, PYTHON…, NODE_… и подобные) ключом быть не могут.',
  'serverKeys.emptyKey': 'Введите ключ.',
  'serverKeys.badKey': 'Ключ — одна строка без управляющих символов, не длиннее 8192 знаков.',
  'serverKeys.noEncryption':
    'Шифрование на этой машине недоступно — ключ не сохранён (в открытом виде не пишем).',
  'quit.buttonQuit': 'Выйти',
  'quit.buttonStay': 'Остаться',
  'quit.andMore': (remaining: number) => `• и ещё ${remaining}`,
  'quit.oneChat': 'Агент ещё работает в одном чате.',
  'quit.manyChats': (count: number) => `Агент ещё работает в чатах: ${count}.`,
  'quit.detail': 'Выход остановит его посреди хода. Всё, что он не успел дописать, пропадёт.',
  'attach.dialogTitle': 'Прикрепить к сообщению',
  'attach.filterImagesPdf': 'Картинки и PDF',
  'attach.filterAll': 'Все файлы',
  'attach.unsupported': (name: string) => `не поддерживается: ${name}`,
  'attach.noClipboardImage': 'в буфере нет картинки',
  'attach.rejected': 'вложение не принято',
  'attach.empty': 'пустой файл',
  'attach.tooLarge': 'файл слишком велик',
  'attach.readForbidden': 'читать можно только вложения этого сеанса и выбранные вами файлы',
  'preview.navMessageHost': (host: string) => `Страница уводит на ${host}`,
  'preview.navMessageOther': 'Страница уводит на другой адрес',
  'preview.navDetail': (address: string) =>
    `Открытая страница пытается перейти по адресу:\n${address}\n\n` +
    'Это другой сайт, а не другая страница того же сайта. Вместе с адресом ' +
    'туда уходит всё, что в нём написано, — поэтому решение за вами.',
  'preview.navGo': 'Перейти',
  'preview.navStay': 'Остаться',

  // --- Чат и окна ------------------------------------------------------------
  'chat.emptyMessage': 'пустое сообщение',
  'chat.unknownTarget': 'неизвестная цель отправки',
  'chat.projectNotOpen': 'проект не открыт',
  'chat.noWindow': 'нет окна',
  'window.sessionMissing': 'номер сессии не указан',
  'window.sessionBroken': 'номер сессии испорчен',
  'window.tabMissing': 'номер вкладки не указан',
  'window.tabBroken': 'номер вкладки испорчен',

  // --- Предпросмотр, файлы, сохранение --------------------------------------
  'preview.fileGone': 'Файла нет на диске — возможно, он был удалён или переименован',
  'preview.rasterOnly': 'Предпросмотр умеет только растровые картинки',
  'preview.imageTooLarge': (megabytes: number) =>
    `Картинка больше ${megabytes} МБ — откройте её в проводнике`,
  'preview.readFailed': (message: string) => `Не удалось прочитать файл: ${message}`,
  'preview.remoteNoWatch': 'Файлы на машине ядра — следить за ними отсюда нечем',
  'preview.watchFailed': (message: string) => `Не удалось начать слежение: ${message}`,
  'preview.nothingToSave': 'Нечего сохранять',
  'preview.saveFailed': (message: string) => `Не удалось сохранить: ${message}`,
  'preview.remoteCannotOpen': 'Файл лежит на машине ядра — открыть его здесь нечем',
  'preview.guestNotFound': 'Гость предпросмотра не найден',
  'preview.captureFailed': (message: string) => `Не удалось снять предпросмотр: ${message}`,
  'preview.captureEmpty': 'Снимок предпросмотра пуст',
  'preview.outsideProject':
    'Предпросмотр показывает только файлы внутри рабочей папки проекта. Этот файл лежит за её пределами — откройте его в проводнике.',
  'preview.externalOnly':
    'В браузере открывается только страница проекта, выбранный вами файл или то, что предпросмотр сам выгрузил',
  'preview.watchOutside': 'Следить можно только за файлом внутри проекта или выбранным в диалоге',
  'preview.writeOutside': 'Сохранять можно только в файл внутри проекта или выбранный в диалоге',
  'artifact.pathMissing': 'путь не указан',
  'artifact.isLink': 'это ссылка, а не файл',
  'artifact.controlChars': 'путь содержит управляющие символы',
  'artifact.relativeNoProject': 'путь относительный, а проект не открыт',
  'link.missing': 'ссылка не указана',
  'link.tooLong': 'ссылка слишком длинная',
  'link.notUrl': 'ссылка не разобрана как URL',
  'link.schemeForbidden': (protocol: string) => `схема ${protocol} не разрешена`,
  'files.liveOnCoreMachine':
    'Ядро работает на другой машине — у этого файла нет пути на вашем компьютере.',
  'files.notFoundOnCore': 'Файл не найден на машине ядра',
  'files.readFailedOnCore': (text: string) => `Не удалось прочитать файл на машине ядра: ${text}`,
  'files.badFileAnswer': 'Ядро вернуло файл в непонятном виде',
  'files.badImageAnswer': 'Ядро вернуло картинку в непонятном виде',
  'saveOut.remoteRefused':
    'Эта картинка лежит в интернете. Откройте её ссылку в браузере и сохраните ' +
    'оттуда — приложение не скачивает файлы по сети вместо окна.',
  'saveOut.noAddress': 'Адрес картинки не указан.',
  'saveOut.controlChars': 'Адрес содержит управляющие символы.',
  'saveOut.brokenDataUrl': 'Картинку не удалось прочитать: адрес data: испорчен.',
  'saveOut.schemeRefused': (scheme: string) => `Приложение не сохраняет адреса вида «${scheme}:».`,
  'saveOut.outsideProject':
    'Сохранять можно только файлы внутри рабочей папки проекта. Этот файл лежит ' +
    'за её пределами — откройте его в проводнике.',
  'saveOut.writeFailed': (message: string) => `Не удалось записать файл: ${message}`,
  'saveOut.fileGone': 'Файла нет на диске — возможно, он был удалён или переименован.',
  'saveOut.imageEmpty': 'Картинка пустая — сохранять нечего.',
  'sheet.noSheets': 'В книге нет листов',
  'trash.failed': (message: string) => `Не удалось переместить в корзину: ${message}`,

  // --- Пути внутри проекта и источника ---------------------------------------
  'path.controlChars': 'Путь содержит недопустимые управляющие символы',
  'path.devicePrefix': 'Служебные префиксы путей (\\\\?\\, \\\\.\\) не поддерживаются',
  'path.colon': 'Путь не может содержать «:»',
  'path.empty': 'Путь не может быть пустым',
  'vault.relativeInside': 'Путь должен быть относительным путём внутри проекта',
  'vault.cannotLeave': 'Путь не может выходить за пределы проекта',
  'vault.leaves': 'Путь выходит за пределы проекта',
  'vault.symlink': 'Путь ведёт за пределы проекта через симлинк',
  'vault.serviceFolder': 'Доступ к служебной папке .aecpilot запрещён',
  'vault.rootOperation': 'Операция над корнем vault недопустима',
  'vault.isProjectFolder': 'Это папка проекта, а не документ',
  'vault.nameEmpty': 'Имя не может быть пустым',
  'vault.nameForbiddenChars': 'Имя содержит запрещённые символы: < > : " / \\ | ? *',
  'vault.nameInvalid': 'Недопустимое имя',
  'vault.nameEndsDotOrSpace': 'Имя не может заканчиваться точкой или пробелом',
  'vault.nameReserved':
    'Это имя зарезервировано системой Windows (CON, PRN, AUX, NUL, COM1-9, LPT1-9)',
  'vault.nameExists': 'Файл или папка с таким именем уже существует',
  'source.relativeInside': 'Путь должен быть относительным путём внутри источника',
  'source.cannotLeave': 'Путь не может выходить за пределы источника',
  'source.leaves': 'Путь выходит за пределы источника',
  'source.symlink': 'Путь ведёт за пределы источника через симлинк',
  'source.isSourceFolder': 'Это папка источника, а не документ',
  'source.notConnected': (id: string) => `Источник «${id}» не подключён`,

  // --- Проект ---------------------------------------------------------------
  'project.agentsExists':
    'В папке уже есть свой файл AGENTS.md — он останется без изменений, будет добавлена только недостающая структура vault',
  'project.aecpilotForeign':
    'В папке уже есть папка или файл «.aecpilot», не относящиеся к этому проекту — они останутся без изменений',
  'project.pathIsFile': 'Указанный путь — файл, а не папка',
  'project.aecpilotIsFile':
    '«.aecpilot» занят файлом — переместите или переименуйте его, чтобы продолжить',
  'project.createFailed': (message: string) => `Не удалось создать проект: ${message}`,
  'project.nameEmpty': 'название проекта не может быть пустым',
  'project.templateReadFailed': (message: string) =>
    `не удалось прочитать шаблон AGENTS.md: ${message}`,
  'project.alreadyProject':
    'Эта папка уже является проектом AECPilot — откройте её через «Открыть проект»',
  'project.folderNotFound': 'Папка не найдена',
  'project.folderUnavailable': (message: string) => `Папка недоступна: ${message}`,
  'project.jsonBroken': 'Файл .aecpilot/project.json повреждён (невалидный JSON)',
  'project.jsonInvalid': (details: string) => `Некорректный project.json: ${details}`,
  'project.wikiLanguageEmpty': 'Язык вики не может быть пустым',
  'project.scanIntervalPositive': 'Интервал сканирования должен быть больше нуля',
  'project.extractionLanguageTrim': 'Язык извлечения не должен начинаться или кончаться пробелом',
  'project.jsonWriteFailed': 'не удалось записать project.json',
  'project.sourcePathUnavailable':
    'Путь сейчас недоступен — источник будет добавлен как недоступный',
  'project.jsonInvalidAfterAdd': (details: string) =>
    `Некорректный project.json после добавления: ${details}`,
  'project.jsonSaveFailed': (message: string) => `Не удалось сохранить project.json: ${message}`,

  // --- Индекс и граф --------------------------------------------------------
  'index.pickFileOrFolder': 'Выберите файл или папку',
  'index.waitIndexing': 'Идёт индексация — дождитесь её конца',
  'index.waitGraph': 'Строится граф — дождитесь его конца',
  'index.folderRemoved': (name: string) => `Папка «${name}» убрана из индекса — верните её целиком`,
  'index.pickProjectFileOrFolder': 'Выберите файл или папку проекта',
  'index.graphBuildingEnableAfter': 'Строится граф — включите после него',
  'index.indexingRemoveAfter': 'Идёт индексация — уберите после неё',
  'index.graphBuildingRemoveAfter': 'Строится граф — уберите после него',
  'index.graphAlreadyBuilding': 'Граф уже строится',
  'index.graphAfterIndexing': 'Идёт индексация — граф строится после неё',
  'index.emptyAnswer': 'пустой ответ',
  'index.logNotCreated': 'журнал ещё не заведён',
  'graph.stopped': 'Построение графа остановлено',
  'graph.silent': (minutes: number) =>
    `aec-rag graph-add молчал ${minutes} мин — процесс остановлен. ` +
    'Добавленные документы остаются в графе.',
  'graph.parseFailed': 'не удалось разобрать ответ aec-rag graph-preview',
  'graph.notObject': 'aec-rag graph-preview ответил не объектом',
  'graph.noNumbers': 'в ответе aec-rag graph-preview нет чисел прогноза',
  'ingest.stopped': 'Индексация остановлена',
  'ingest.silent': (minutes: number) =>
    `aec-rag ingest молчал ${minutes} мин — процесс остановлен. ` +
    'Готовое сохранено; следующий запуск продолжит с места остановки.',
  'runner.noAnswerInTime': (command: string) => `aec-rag ${command} не ответил вовремя`,
  'runner.spawnFailed': (command: string, message: string) =>
    `не удалось запустить aec-rag ${command}: ${message}`,
  'runner.exitFailed': (command: string, code: number | null, detail: string) =>
    `aec-rag ${command} завершился с ошибкой (код ${code}): ${detail}`,
  'runner.noReport': (command: string) => `aec-rag ${command} не отчитался о результате`,
  'runner.parseAnswerFailed': (command: string, message: string) =>
    `не удалось разобрать ответ aec-rag ${command}: ${message}`,
  'runner.parseReportFailed': (command: string, message: string) =>
    `не удалось разобрать отчёт aec-rag ${command}: ${message}`,
  'runner.killedAfterMinutes': (command: string, minutes: number) =>
    `aec-rag ${command} не завершился за ${minutes} мин — процесс принудительно остановлен`,
  'runner.killedAfterSeconds': (command: string, seconds: number) =>
    `aec-rag ${command} не завершился за ${seconds} с — процесс принудительно остановлен`,
  'quote.noAnswerInTime': 'проверка выдержек не ответила вовремя',
  'quote.spawnFailed': (message: string) => `не удалось запустить проверку: ${message}`,
  'quote.writeBroken': 'проверка выдержек оборвалась на записи',
  'quote.exitCode': (code: number | null) => `код ${code}`,
  'quote.unreadable': 'проверка выдержек ответила неразборчиво',

  // --- Память ---------------------------------------------------------------
  'memory.readerNoAnswer': 'Читатель памяти не ответил',
  'memory.factsNotRead': 'Список фактов не прочитан',
  'memory.readerNoAnswerInTime': 'Читатель памяти не ответил вовремя',
  'memory.readerSpawnFailed': (message: string) =>
    `Не удалось запустить читатель памяти: ${message}`,
  'memory.remoteCoreOffline':
    'Ядро на другой машине не на связи — список фактов читается только у него',
  'memory.readProjectFailed': 'Не удалось прочитать память проекта',
  'memory.factNotNamed': 'Не сказано, какой факт удалить',
  'memory.deleteFactFailed': 'Не удалось удалить факт',
  'memory.readNoteFailed': 'Не удалось прочитать записку памяти',
  'memory.saveNoteFailed': 'Не удалось сохранить записку',
  'memory.autowriteFailed': 'Не удалось изменить автозапись',
  'memory.noteTooLong': (length: number, limit: number) =>
    `Записка длиннее предела ядра: ${length} знаков против ${limit}. ` +
    'Ядро вклеивает её в каждый ход целиком, поэтому сократите текст — ' +
    'подробности лучше держать в памяти проекта.',

  // --- Ядро, профили, подключение -------------------------------------------
  'rest.redacted': '[скрыто]',
  'rest.badRequest': (suffix: string) => `Ядро отклонило запрос${suffix}`,
  'rest.tokenRejected': 'Ядро не приняло токен сессии — перезапустите бэкенд в разделе «Шлюз»',
  'rest.notFound': (suffix: string) => `Не найдено${suffix}`,
  'rest.exists': (suffix: string) => `Уже существует${suffix}`,
  'rest.invalidForm': (suffix: string) => `Ядро не приняло данные формы${suffix}`,
  'rest.serverError': (status: number, suffix: string) =>
    `Ошибка на стороне ядра (${status})${suffix}`,
  'rest.rejected': (status: number, suffix: string) => `Запрос отклонён (${status})${suffix}`,
  'rest.timeout': (seconds: number) => `Ядро не ответило за ${seconds} с`,
  'rest.requestFailed': (message: string) => `Не удалось обратиться к ядру: ${message}`,
  'profile.invalidName': 'недопустимое имя профиля',
  'profile.deleteCurrent':
    'Это профиль, под которым сейчас работает ядро — сначала переключитесь на другой.',
  'profile.deleteDefault':
    'Профиль «default» — это сам домашний каталог hermes, удалять его приложение не даёт.',
  'profile.deleteConfirm': (name: string) =>
    `Удалить профиль «${name}»? Вместе с ним исчезнут его настройки, ключи, скилы и вся ` +
    'история его сессий — это отдельный каталог на диске, и восстановить его будет нечем.',
  'profile.deleteInUse':
    'Профиль не удалён: ядро держит его базу открытой, пока в этом запуске ' +
    'была сессия этого профиля. Закройте сессию и перезапустите приложение, ' +
    'затем повторите удаление.',
  'yolo.noLiveSession': 'нет живой сессии — YOLO переключается только в её пределах',
  'secretFilter.notLoaded':
    'Фильтр секретов не загрузился, поэтому ход не отправлен: без него агент мог бы ' +
    'передать ключ или пароль наружу. Перезапустите приложение. Если повторится — ' +
    'подробности в журнале ядра (logs/errors.log профиля).',
  'providerKey.envWins': (envVar: string) =>
    `${envVar} задан в .env профиля — значение оттуда сильнее нашего. ` +
    'Уберите строку из .env и повторите.',
  'providerKey.noSafeStorage':
    'safeStorage недоступен на этой машине — ключ не сохранён (в открытом виде не пишем)',
  'connection.noMachine': 'Не указана машина, к которой подключаться',
  'connection.tunnelNoConnect': 'Туннель поднялся, но подключение не состоялось',
  'connection.badAddress': 'Адрес не похож на адрес сервера',
  'connection.noToken': 'Токен не задан',
  'connection.encryptFailed': (message: string) => `Не удалось зашифровать токен: ${message}`,
  'connection.plainTextConsent':
    'На этой машине нет безопасного хранилища ключей, поэтому токен можно ' +
    'сохранить только открытым текстом. Это отдельное согласие — подтвердите ' +
    'его, если так и нужно.',
  'connection.saveFailed': (message: string) =>
    `Не удалось сохранить настройку подключения: ${message}`,
  'ssh.noFreePort': 'нет свободного порта',
  'ssh.coreNoAnswer':
    'Ядро на той машине не ответило вовремя. Проверьте, что путь к `hermes` верен и он там запускается.',
  'ssh.error.auth-failed':
    'Сервер не принял вход. Нужен вход по ключу без пароля: пароль спросить негде — у подключения нет терминала.',
  'ssh.error.host-key-changed':
    'Ключ сервера изменился с прошлого раза. Это либо переустановка сервера, либо подмена: проверьте у администратора, прежде чем убирать старый ключ из ~/.ssh/known_hosts.',
  'ssh.error.hermes-not-found':
    'На той машине не нашлось ядра. Укажите полный путь к `hermes` в настройках подключения.',
  'ssh.error.timeout': 'Сервер не ответил вовремя. Проверьте адрес и доступность сети.',
  'ssh.error.unreachable': 'До сервера не достучаться: имя не разрешается или порт закрыт.',
  'ssh.error.unsupported-platform':
    'На той машине оболочка Windows, а подключение рассчитано на POSIX: нужен сервер с оболочкой вроде bash.',
  'ssh.error.update-required':
    'Ядро на той машине слишком старое для этого приложения — обновите его там.',
  'ssh.error.unknown': 'Подключиться не удалось. Подробности — в журнале приложения.',

  // --- Провайдеры индекса и памяти -------------------------------------------
  'provider.settingsPlace': 'окне «Индекс и память» (палитра команд, Ctrl+K)',
  'provider.notChosen': 'провайдер не выбран',
  'provider.noPresetAddress': (raw: string) =>
    `для провайдера «${raw}» нет OpenAI-совместимого адреса в таблице`,
  'provider.noBaseUrl': 'у своего адреса не указан base_url',
  'provider.noKeyVar': 'у своего адреса не указана переменная ключа',
  'provider.agentNoAddress': (raw: string, place: string) =>
    `агент работает через «${raw}» — у этого входа нет адреса с ключом для индекса и памяти; выберите провайдера в ${place}`,
  'provider.noRagModels': (place: string) =>
    `у своего адреса не выбраны модели RAG — укажите их в ${place}`,
  'provider.noMemoryModels': (place: string) =>
    `у своего адреса не выбраны модели памяти — укажите их в ${place}`,
  'provider.dimsUnknown': (model: string, place: string) =>
    `ширина вектора модели «${model}» не измерена — выберите модель заново в ${place}`,
  'provider.warnIndexModel': (from: string, to: string) =>
    `Индекс проекта построен моделью «${from}», с этим выбором эмбеддинги считает «${to}». ` +
    'Векторы разных моделей несравнимы: после сохранения индекс попросит перестройку — ' +
    'в индикаторе индекса, с ценой до запуска.',
  'provider.warnMemoryModel': (from: string, to: string) =>
    `Память записана моделью «${from}», с этим выбором — «${to}». ` +
    'Прежние факты не будут видны, пока модель не возвращена; удалены они не будут.',
  'provider.notHttp': (url: string) => `адрес «${url}» не http(s)`,
  'provider.keyNotSet': (envVar: string) => `ключ ${envVar} не задан`,
  'provider.answered': (status: number) => `провайдер ответил ${status}`,
  'provider.networkError': 'ошибка сети',
  'provider.noAnswer': (reason: string) => `провайдер не ответил (${reason})`,
  'provider.profileNotFound': 'профиль ядра не найден',
  'provider.noModels': 'провайдер не назвал ни одной модели',
  'provider.badKeyVarName': (name: string) =>
    `имя переменной ключа «${name}»: латинские заглавные буквы, цифры и _`,
  'provider.profileNotFoundNotSaved': 'профиль ядра не найден — выбор не сохранён',
  'provider.noVectorInAnswer': 'в ответе нет вектора',
  'provider.dimsNotMeasured': (model: string, why: string) =>
    `ширина вектора модели «${model}» не измерена: ${why} — выбор не сохранён`,
  'provider.choiceNotWritten': 'файл выбора не записался — выбор не сохранён'
}

type Catalog = typeof ru

const en: Catalog = {
  'common.noProject': 'No project is open',
  'common.noProjectLc': 'no project is open',
  'common.sourceNotFound': 'Source not found',
  'common.fileNotFound': 'File not found',
  'common.fileNoAccess': 'No access to the file',
  'common.notAFile': 'This is not a file',
  'common.notAFileDot': 'This is not a file.',
  'common.folderNotDocument': 'This is a folder, not a document',
  'common.fileTooLargeToView': 'The file is too large to view',
  'common.indexingAlreadyRunning': 'Indexing is already running',
  'common.noGatewayLc': 'no connection to the gateway',
  'common.emptyPath': 'Empty path',
  'common.noCoreConnectionLc': 'no connection to the core',
  'licenses.noticesMissing':
    'There is no license file here: it is built with the installer and lives in the folder of the installed program',

  'tray.show': 'Show AECPilot',
  'tray.quit': 'Quit AECPilot',
  'remoteProject.folderRejected': (reason: string) =>
    `The server did not accept the folder as its working folder: ${reason}`,
  'remoteProject.serverDidNotOpen':
    'The server did not confirm opening the project within two minutes. Check that the AECPilot server is running (its tray icon on the server) and try again.',
  'remoteProject.scanOnServer':
    'The server scans on its own schedule — including while this app is closed.',
  'remoteProject.requestFailed': (reason: string) =>
    `Could not pass the request to the server: ${reason}`,
  'remoteProject.serverDidNotAnswer':
    'The server did not answer within a minute and a half. Check that the AECPilot server is running and try again.',
  'remoteProject.wholeIndexOnly':
    'On a server the whole project is indexed at once: indexing a part or rebuilding is done on the server itself.',
  'connection.clientHasNoCore':
    'This is an app-only installation with no core of its own. Connect to a server.',
  'serverTray.tooltip': 'AECPilot — server',
  'serverTray.running': 'AECPilot server is running',
  'serverTray.starting': 'AECPilot server is starting…',
  'serverTray.failed': 'AECPilot server did not start — see the log',
  'serverTray.copyToken': 'Copy connection token',
  'serverTray.newToken': 'Issue a new token',
  'serverTray.newTokenConfirm':
    'The old token will stop working and every connected client will be disconnected. Each one will need the new token.',
  'serverTray.newTokenButton': 'Issue new',
  'serverTray.cancel': 'Cancel',
  'serverTray.copied': 'Token copied. Paste it into the connection window on the client.',
  'serverTray.quit': 'Stop the server',
  'serverTray.keys': 'Model keys…',
  'serverKeys.title': 'AECPilot — model keys',
  'serverKeys.intro':
    'Provider keys for the core and indexing on this server. They are stored encrypted here and never sent over the network; this window never shows a stored value.',
  'serverKeys.stored': 'stored',
  'serverKeys.notStored': 'not set',
  'serverKeys.envWins': 'set in the profile .env — that value wins',
  'serverKeys.name': 'Variable',
  'serverKeys.value': 'Key',
  'serverKeys.save': 'Save',
  'serverKeys.remove': 'Remove',
  'serverKeys.close': 'Close',
  'serverKeys.saving': 'Saving and restarting the core…',
  'serverKeys.saved': 'Key saved, core restarted.',
  'serverKeys.removed': 'Key removed, core restarted.',
  'serverKeys.restartFailed': (reason) => `Key saved, but the core did not restart: ${reason}`,
  'serverKeys.badName':
    'A variable name is capital Latin letters, digits and “_”, for example GEMINI_API_KEY; system variables (PATH, PYTHON…, NODE_… and the like) cannot hold a key.',
  'serverKeys.emptyKey': 'Enter a key.',
  'serverKeys.badKey': 'A key is one line without control characters, at most 8192 characters long.',
  'serverKeys.noEncryption':
    'Encryption is not available on this machine — the key was not saved (we never write it in plain text).',
  'quit.buttonQuit': 'Quit',
  'quit.buttonStay': 'Stay',
  'quit.andMore': (remaining) => `• and ${remaining} more`,
  'quit.oneChat': 'The agent is still working in one chat.',
  'quit.manyChats': (count) => `The agent is still working in ${count} chats.`,
  'quit.detail':
    'Quitting will stop it mid-turn. Anything it has not finished writing will be lost.',
  'attach.dialogTitle': 'Attach to message',
  'attach.filterImagesPdf': 'Images and PDF',
  'attach.filterAll': 'All files',
  'attach.unsupported': (name) => `not supported: ${name}`,
  'attach.noClipboardImage': 'there is no image on the clipboard',
  'attach.rejected': 'the attachment was not accepted',
  'attach.empty': 'empty file',
  'attach.tooLarge': 'the file is too large',
  'attach.readForbidden': 'only this session’s attachments and files you picked can be read',
  'preview.navMessageHost': (host) => `The page redirects to ${host}`,
  'preview.navMessageOther': 'The page redirects to another address',
  'preview.navDetail': (address) =>
    `The open page is trying to navigate to:\n${address}\n\n` +
    'This is a different site, not another page of the same site. Everything written ' +
    'in the address goes there with it — so the decision is yours.',
  'preview.navGo': 'Go',
  'preview.navStay': 'Stay',

  'chat.emptyMessage': 'empty message',
  'chat.unknownTarget': 'unknown send target',
  'chat.projectNotOpen': 'no project is open',
  'chat.noWindow': 'no window',
  'window.sessionMissing': 'session id is not specified',
  'window.sessionBroken': 'session id is malformed',
  'window.tabMissing': 'tab id is not specified',
  'window.tabBroken': 'tab id is malformed',

  'preview.fileGone': 'The file is not on disk — it may have been deleted or renamed',
  'preview.rasterOnly': 'Preview only supports raster images',
  'preview.imageTooLarge': (megabytes) =>
    `The image is larger than ${megabytes} MB — open it in File Explorer`,
  'preview.readFailed': (message) => `Could not read the file: ${message}`,
  'preview.remoteNoWatch': 'The files are on the core’s machine — they cannot be watched from here',
  'preview.watchFailed': (message) => `Could not start watching: ${message}`,
  'preview.nothingToSave': 'Nothing to save',
  'preview.saveFailed': (message) => `Could not save: ${message}`,
  'preview.remoteCannotOpen': 'The file is on the core’s machine — it cannot be opened here',
  'preview.guestNotFound': 'Preview guest not found',
  'preview.captureFailed': (message) => `Could not capture the preview: ${message}`,
  'preview.captureEmpty': 'The preview snapshot is empty',
  'preview.outsideProject':
    'Preview only shows files inside the project’s working folder. This file is outside it — open it in File Explorer.',
  'preview.externalOnly':
    'Only the project page, a file you picked, or something the preview exported itself can be opened in the browser',
  'preview.watchOutside':
    'Only a file inside the project or one picked in the dialog can be watched',
  'preview.writeOutside':
    'Only a file inside the project or one picked in the dialog can be saved to',
  'artifact.pathMissing': 'no path specified',
  'artifact.isLink': 'this is a link, not a file',
  'artifact.controlChars': 'the path contains control characters',
  'artifact.relativeNoProject': 'the path is relative and no project is open',
  'link.missing': 'no link specified',
  'link.tooLong': 'the link is too long',
  'link.notUrl': 'the link could not be parsed as a URL',
  'link.schemeForbidden': (protocol) => `the ${protocol} scheme is not allowed`,
  'files.liveOnCoreMachine':
    'The core runs on another machine — this file has no path on your computer.',
  'files.notFoundOnCore': 'File not found on the core’s machine',
  'files.readFailedOnCore': (text) => `Could not read the file on the core’s machine: ${text}`,
  'files.badFileAnswer': 'The core returned the file in an unrecognizable form',
  'files.badImageAnswer': 'The core returned the image in an unrecognizable form',
  'saveOut.remoteRefused':
    'This image is on the internet. Open its link in the browser and save it ' +
    'from there — the app does not download files over the network in place of the dialog.',
  'saveOut.noAddress': 'The image address is not specified.',
  'saveOut.controlChars': 'The address contains control characters.',
  'saveOut.brokenDataUrl': 'Could not read the image: the data: address is corrupted.',
  'saveOut.schemeRefused': (scheme) => `The app does not save addresses of the form “${scheme}:”.`,
  'saveOut.outsideProject':
    'Only files inside the project’s working folder can be saved. This file is ' +
    'outside it — open it in File Explorer.',
  'saveOut.writeFailed': (message) => `Could not write the file: ${message}`,
  'saveOut.fileGone': 'The file is not on disk — it may have been deleted or renamed.',
  'saveOut.imageEmpty': 'The image is empty — there is nothing to save.',
  'sheet.noSheets': 'The workbook has no sheets',
  'trash.failed': (message) => `Could not move to the Recycle Bin: ${message}`,

  'path.controlChars': 'The path contains forbidden control characters',
  'path.devicePrefix': 'Device path prefixes (\\\\?\\, \\\\.\\) are not supported',
  'path.colon': 'The path cannot contain “:”',
  'path.empty': 'The path cannot be empty',
  'vault.relativeInside': 'The path must be relative and inside the project',
  'vault.cannotLeave': 'The path cannot leave the project',
  'vault.leaves': 'The path leaves the project',
  'vault.symlink': 'The path leads outside the project through a symlink',
  'vault.serviceFolder': 'Access to the .aecpilot service folder is forbidden',
  'vault.rootOperation': 'This operation on the vault root is not allowed',
  'vault.isProjectFolder': 'This is a project folder, not a document',
  'vault.nameEmpty': 'The name cannot be empty',
  'vault.nameForbiddenChars': 'The name contains forbidden characters: < > : " / \\ | ? *',
  'vault.nameInvalid': 'Invalid name',
  'vault.nameEndsDotOrSpace': 'The name cannot end with a dot or a space',
  'vault.nameReserved': 'This name is reserved by Windows (CON, PRN, AUX, NUL, COM1-9, LPT1-9)',
  'vault.nameExists': 'A file or folder with this name already exists',
  'source.relativeInside': 'The path must be relative and inside the source',
  'source.cannotLeave': 'The path cannot leave the source',
  'source.leaves': 'The path leaves the source',
  'source.symlink': 'The path leads outside the source through a symlink',
  'source.isSourceFolder': 'This is a source folder, not a document',
  'source.notConnected': (id) => `Source “${id}” is not connected`,

  'project.agentsExists':
    'The folder already has its own AGENTS.md — it will stay unchanged, and only the missing vault structure will be added',
  'project.aecpilotForeign':
    'The folder already contains a folder or file “.aecpilot” that does not belong to this project — it will stay unchanged',
  'project.pathIsFile': 'The given path is a file, not a folder',
  'project.aecpilotIsFile': '“.aecpilot” is occupied by a file — move or rename it to continue',
  'project.createFailed': (message) => `Could not create the project: ${message}`,
  'project.nameEmpty': 'the project name cannot be empty',
  'project.templateReadFailed': (message) => `could not read the AGENTS.md template: ${message}`,
  'project.alreadyProject':
    'This folder is already an AECPilot project — open it through “Open project”',
  'project.folderNotFound': 'Folder not found',
  'project.folderUnavailable': (message) => `The folder is unavailable: ${message}`,
  'project.jsonBroken': 'The .aecpilot/project.json file is damaged (invalid JSON)',
  'project.jsonInvalid': (details) => `Invalid project.json: ${details}`,
  'project.wikiLanguageEmpty': 'The wiki language cannot be empty',
  'project.scanIntervalPositive': 'The scan interval must be greater than zero',
  'project.extractionLanguageTrim': 'The extraction language must not start or end with a space',
  'project.jsonWriteFailed': 'could not write project.json',
  'project.sourcePathUnavailable':
    'The path is unavailable right now — the source will be added as unavailable',
  'project.jsonInvalidAfterAdd': (details) => `Invalid project.json after adding: ${details}`,
  'project.jsonSaveFailed': (message) => `Could not save project.json: ${message}`,

  'index.pickFileOrFolder': 'Select a file or folder',
  'index.waitIndexing': 'Indexing is in progress — wait for it to finish',
  'index.waitGraph': 'A graph is being built — wait for it to finish',
  'index.folderRemoved': (name) =>
    `The folder “${name}” was removed from the index — restore it as a whole`,
  'index.pickProjectFileOrFolder': 'Select a project file or folder',
  'index.graphBuildingEnableAfter': 'A graph is being built — turn this on after it finishes',
  'index.indexingRemoveAfter': 'Indexing is in progress — remove this after it finishes',
  'index.graphBuildingRemoveAfter': 'A graph is being built — remove this after it finishes',
  'index.graphAlreadyBuilding': 'The graph is already being built',
  'index.graphAfterIndexing': 'Indexing is in progress — the graph is built after it',
  'index.emptyAnswer': 'empty answer',
  'index.logNotCreated': 'the log has not been created yet',
  'graph.stopped': 'Graph building stopped',
  'graph.silent': (minutes) =>
    `aec-rag graph-add was silent for ${minutes} min — the process was stopped. ` +
    'The documents added so far stay in the graph.',
  'graph.parseFailed': 'could not parse the aec-rag graph-preview answer',
  'graph.notObject': 'aec-rag graph-preview did not answer with an object',
  'graph.noNumbers': 'the aec-rag graph-preview answer has no forecast numbers',
  'ingest.stopped': 'Indexing stopped',
  'ingest.silent': (minutes) =>
    `aec-rag ingest was silent for ${minutes} min — the process was stopped. ` +
    'What was finished is saved; the next run will resume where it stopped.',
  'runner.noAnswerInTime': (command) => `aec-rag ${command} did not respond in time`,
  'runner.spawnFailed': (command, message) => `could not start aec-rag ${command}: ${message}`,
  'runner.exitFailed': (command, code, detail) =>
    `aec-rag ${command} failed (code ${code}): ${detail}`,
  'runner.noReport': (command) => `aec-rag ${command} did not report a result`,
  'runner.parseAnswerFailed': (command, message) =>
    `could not parse the aec-rag ${command} answer: ${message}`,
  'runner.parseReportFailed': (command, message) =>
    `could not parse the aec-rag ${command} report: ${message}`,
  'runner.killedAfterMinutes': (command, minutes) =>
    `aec-rag ${command} did not finish within ${minutes} min — the process was forcibly stopped`,
  'runner.killedAfterSeconds': (command, seconds) =>
    `aec-rag ${command} did not finish within ${seconds} s — the process was forcibly stopped`,
  'quote.noAnswerInTime': 'the quote check did not respond in time',
  'quote.spawnFailed': (message) => `could not start the check: ${message}`,
  'quote.writeBroken': 'the quote check broke off while being written to',
  'quote.exitCode': (code) => `code ${code}`,
  'quote.unreadable': 'the quote check gave an unreadable answer',

  'memory.readerNoAnswer': 'The memory reader did not respond',
  'memory.factsNotRead': 'The fact list was not read',
  'memory.readerNoAnswerInTime': 'The memory reader did not respond in time',
  'memory.readerSpawnFailed': (message) => `Could not start the memory reader: ${message}`,
  'memory.remoteCoreOffline':
    'The core on the other machine is offline — the fact list can only be read there',
  'memory.readProjectFailed': 'Could not read the project memory',
  'memory.factNotNamed': 'It was not said which fact to delete',
  'memory.deleteFactFailed': 'Could not delete the fact',
  'memory.readNoteFailed': 'Could not read the memory note',
  'memory.saveNoteFailed': 'Could not save the note',
  'memory.autowriteFailed': 'Could not change auto-write',
  'memory.noteTooLong': (length, limit) =>
    `The note is longer than the core’s limit: ${length} characters against ${limit}. ` +
    'The core pastes it into every turn in full, so shorten the text — ' +
    'details are better kept in the project memory.',

  'rest.redacted': '[hidden]',
  'rest.badRequest': (suffix) => `The core rejected the request${suffix}`,
  'rest.tokenRejected':
    'The core did not accept the session token — restart the backend in the “Gateway” section',
  'rest.notFound': (suffix) => `Not found${suffix}`,
  'rest.exists': (suffix) => `Already exists${suffix}`,
  'rest.invalidForm': (suffix) => `The core did not accept the form data${suffix}`,
  'rest.serverError': (status, suffix) => `Core-side error (${status})${suffix}`,
  'rest.rejected': (status, suffix) => `Request rejected (${status})${suffix}`,
  'rest.timeout': (seconds) => `The core did not respond within ${seconds} s`,
  'rest.requestFailed': (message) => `Could not reach the core: ${message}`,
  'profile.invalidName': 'invalid profile name',
  'profile.deleteCurrent':
    'This is the profile the core is currently running as — switch to another one first.',
  'profile.deleteDefault':
    'The “default” profile is the hermes home directory itself — the app does not allow deleting it.',
  'profile.deleteConfirm': (name) =>
    `Delete the profile “${name}”? Its settings, keys, skills and the whole ` +
    'session history will disappear with it — it is a separate directory on disk, and it cannot be restored.',
  'profile.deleteInUse':
    'The profile was not deleted: the core keeps its database open while this ' +
    'profile had a session in this run. Close the session and restart the app, ' +
    'then repeat the deletion.',
  'yolo.noLiveSession': 'no live session — YOLO can only be toggled within one',
  'secretFilter.notLoaded':
    'The secret filter did not load, so the turn was not sent: without it the agent could ' +
    'pass a key or password outside. Restart the app. If it repeats — ' +
    'see the core log (the profile’s logs/errors.log).',
  'providerKey.envWins': (envVar) =>
    `${envVar} is set in the profile’s .env — the value there overrides ours. ` +
    'Remove the line from .env and try again.',
  'providerKey.noSafeStorage':
    'safeStorage is unavailable on this machine — the key was not saved (we do not write it in plain text)',
  'connection.noMachine': 'No machine to connect to is specified',
  'connection.tunnelNoConnect': 'The tunnel is up, but the connection failed',
  'connection.badAddress': 'The address does not look like a server address',
  'connection.noToken': 'The token is not set',
  'connection.encryptFailed': (message) => `Could not encrypt the token: ${message}`,
  'connection.plainTextConsent':
    'This machine has no secure key storage, so the token can only be ' +
    'saved as plain text. This is a separate consent — confirm it ' +
    'if that is what you want.',
  'connection.saveFailed': (message) => `Could not save the connection setting: ${message}`,
  'ssh.noFreePort': 'no free port',
  'ssh.coreNoAnswer':
    'The core on that machine did not respond in time. Check that the path to `hermes` is correct and that it runs there.',
  'ssh.error.auth-failed':
    'The server did not accept the login. Key-based login without a password is required: there is nowhere to ask for a password — the connection has no terminal.',
  'ssh.error.host-key-changed':
    'The server key has changed since last time. Either the server was reinstalled or it is being impersonated: check with the administrator before removing the old key from ~/.ssh/known_hosts.',
  'ssh.error.hermes-not-found':
    'The core was not found on that machine. Specify the full path to `hermes` in the connection settings.',
  'ssh.error.timeout':
    'The server did not respond in time. Check the address and network availability.',
  'ssh.error.unreachable':
    'The server cannot be reached: the name does not resolve or the port is closed.',
  'ssh.error.unsupported-platform':
    'That machine runs a Windows shell, but the connection is designed for POSIX: a server with a bash-like shell is required.',
  'ssh.error.update-required':
    'The core on that machine is too old for this app — update it there.',
  'ssh.error.unknown': 'Could not connect. Details are in the app log.',

  'provider.settingsPlace': 'the “Index and memory” window (command palette, Ctrl+K)',
  'provider.notChosen': 'no provider chosen',
  'provider.noPresetAddress': (raw) =>
    `there is no OpenAI-compatible address in the table for the provider “${raw}”`,
  'provider.noBaseUrl': 'the custom address has no base_url',
  'provider.noKeyVar': 'the custom address has no key variable',
  'provider.agentNoAddress': (raw, place) =>
    `the agent works through “${raw}” — this sign-in has no address with a key for the index and memory; choose a provider in ${place}`,
  'provider.noRagModels': (place) =>
    `no RAG models are chosen for the custom address — set them in ${place}`,
  'provider.noMemoryModels': (place) =>
    `no memory models are chosen for the custom address — set them in ${place}`,
  'provider.dimsUnknown': (model, place) =>
    `the vector width of the model “${model}” has not been measured — choose the model again in ${place}`,
  'provider.warnIndexModel': (from, to) =>
    `The project index was built with the model “${from}”; with this choice, embeddings are computed by “${to}”. ` +
    'Vectors of different models are not comparable: after saving, the index will ask for a rebuild — ' +
    'in the index indicator, with the cost shown before it starts.',
  'provider.warnMemoryModel': (from, to) =>
    `Memory was written with the model “${from}”; with this choice — “${to}”. ` +
    'The earlier facts will not be visible until the model is restored; they will not be deleted.',
  'provider.notHttp': (url) => `the address “${url}” is not http(s)`,
  'provider.keyNotSet': (envVar) => `the key ${envVar} is not set`,
  'provider.answered': (status) => `the provider answered ${status}`,
  'provider.networkError': 'network error',
  'provider.noAnswer': (reason) => `the provider did not respond (${reason})`,
  'provider.profileNotFound': 'core profile not found',
  'provider.noModels': 'the provider did not list any models',
  'provider.badKeyVarName': (name) =>
    `key variable name “${name}”: Latin capital letters, digits and _ only`,
  'provider.profileNotFoundNotSaved': 'core profile not found — the choice was not saved',
  'provider.noVectorInAnswer': 'the answer has no vector',
  'provider.dimsNotMeasured': (model, why) =>
    `the vector width of the model “${model}” was not measured: ${why} — the choice was not saved`,
  'provider.choiceNotWritten': 'the choice file was not written — the choice was not saved'
}

export const mainCatalog = { en, ru }

export type MainCatalogKey = keyof Catalog
