# T37 — предрелизная сверка: анализ и подготовка решений

Дата замеров: 2026-10-19. Режим: только чтение (изменений зависимостей, кода, реестров, TASKS нет).
Все команды запускались из корня репозитория; `pnpm audit` ходил в реестр сам, других сетевых
запросов не было. Метаданные npm для сведений об Electron 43.x взяты из локального кэша pnpm
(`%LOCALAPPDATA%\pnpm-cache\v11\metadata`, снят 2026-10-17 01:32) — это не живой запрос, см. §4.

Что НЕ сделано: ничего не установлено и не обновлено; e2e и Electron не запускались; патчи
таблиц реестров проверены только на копиях в каталоге scratchpad, в репозитории реестры не менялись.

## Сводка

| Пункт | Итог |
|---|---|
| `pnpm parity -- --gate` | красный. Три реестра, **25 красных мест**: 4 устаревшие строки таблицы каналов + 15 расхождений каналов (ещё 2 расхождения, `terminal` и `requestMicrophoneAccess`, — те же устаревшие строки; из 15 у 10 решения владельца уже есть в SPEC/контракте, у 5 нет) + 3 расхождения инструментов + 2 устаревших вердикта инструментов + 1 устаревший вердикт платформ. Механически чинится всё, кроме **двух вопросов владельцу** (§1.4). Проверено прогоном патченых копий: все три реестра дают exit 0 |
| Дефект проводки `pnpm parity -- --gate` | флаг `--gate` до `parity-registry.mjs` не доходит (§1.5); Check в T37 надо переформулировать |
| `pnpm audit --prod` | exit 0: 14 находок, все 14 в `ignoreGhsas` (1 критическая, 8 высоких, 4 средних, 1 низкая). Исключение `GHSA-w5hq-g745-h8pq` (uuid) — **рекомендую подтвердить** |
| `pnpm audit` (полный) | exit 1: 35 находок, 21 новая (8 высоких, 10 средних, 3 низких). 20 из 21 закрываются подъёмом версий; без исправления остаётся только `sprintf-js@1.1.3` (исправленной версии нет). Одна (`postcss-selector-parser`) закрывается только форсированным мажором — рекомендую запись |
| Лицензии | `buffers@0.1.1` — лицензии нет; вариант снятия есть и дешёвый (§3.1). agent-browser 0.26.0 — **Apache-2.0**, файл LICENSE в поставке. GPL/AGPL/SSPL в коде библиотек поставки нет; LGPL — в двух колёсах MCP-питона (shapely→GEOS, opencv-python→FFmpeg), под C3 это требует отдельного слова владельца (§3.4) |
| Electron | lock 43.0.0; **минимум для закрытия всех четырёх советов — 43.5.0**; рекомендуемая цель — **43.8.0** (последняя 43.x в кэше). `<webview>` у нас включён (`webviewTag: true`), значит GHSA-9qh4-3jw8-366w нас касается напрямую |

---

## 1. Реестры паритета

Скрипт `pnpm parity` = `parity-registry.mjs && tool-registry.mjs && platform-registry.mjs`
(цепочка `&&` останавливается на первом красном). В штатном прогоне pnpm доходит только до
первого. Я запускал каждый реестр отдельно с `--gate` (результаты — ниже).

### 1.1 `parity-registry.mjs` (каналы главного процесса и экраны, против донора `d923a5eb` = ядро 0.22.2)

**ТАБЛИЦА УСТАРЕЛА (4)** — именно это валит `--gate` (`registry.problems.length > 0`).
Объективно неверные строки таблицы `ELECTRON_CLASSIFICATION` в `runtime/parity-registry.mjs`:

| Строка таблицы | Почему красная | Решение (механическое) |
|---|---|---|
| `terminal: { ours: "terminal" }` (стр. 124) | Обещает наш канал `terminal`, в `preload/index.ts` его нет: панель живой оболочки снята задачей 3L.11 (SPEC HX7-прим., 2026-10-12). У донора канал `terminal` есть, значит строка нужна, но с другим основанием | Заменить на `ourWay` на `apps/desktop/src/renderer/src/shared/hermes-desktop-shim.ts` (там `terminal: undefined`, стр. 921) с примечанием «панель убрана, HX7-прим.». В виде `hx` записать нельзя: `readExclusions` читает только `- **HXn.` без зачёркнутого HX7 и без «HX7-прим.» |
| `requestMicrophoneAccess: { ours: "media" }` (стр. 202) | Канала `media` у нас нет: голос снят целиком (HX19, 3H.3, 2026-10-07) | Заменить на `{ hx: "HX19" }` |
| `"intro-reveal": { hx: "HX26" }` (стр. 269) | Этого канала у донора на 0.22.2 больше нет (контракт `runtime/contracts/donor-move-0.22.2.md`: `components/intro-reveal/**` и `store/intro-reveal.ts` сняты) | Удалить строку |
| `"chat-onboarding": { hx: "HX26" }` (стр. 270) | То же: `components/onboarding-chat/**` снят у донора | Удалить строку |

**РАСХОЖДЕНИЕ (17)** — под `--gate` не валит (это очередь решений), но `pnpm parity` без флага (и «AC9») ждёт пусто.
Два из них (`terminal`, `requestMicrophoneAccess`) закрываются теми же правками, что выше. Остальные 15 — каналы,
пришедшие с 0.22.2/0.21.5 без строки в таблице. По каждому уже есть запись решения в SPEC или в `shim`:

| Канал донора | Что это | Решение уже записано | Строка для таблицы |
|---|---|---|---|
| `desktop-metrics` | телеметрия для Nous | SPEC HX31; shim: `desktopMetrics: undefined`; контракт §4 | `{ hx: "HX31" }` |
| `startup-latency` | `claimStartupLatency` — замер старта для той же телеметрии | HX31 (контракт §4: `report-startup-latency.ts` мёртвым) | `{ hx: "HX31" }` |
| `freeTierChallenge` | вход в бесплатный тариф их облака | HX3; shim: `freeTierChallenge: undefined` | `{ hx: "HX3" }` |
| `update-hold` | их обновлятор | HX4; shim: `updateHold: undefined`; контракт §4 | `{ hx: "HX4" }` |
| `hud-modifier` | жест Ctrl+Alt для HUD | HX29 (дополнено 2026-09-28: НЕ берётся) | `{ hx: "HX29" }` |
| `screenshot` | снимок окна жестом двух Command (macOS) | HX29 | `{ hx: "HX29" }` |
| `window-control` | кнопки окна под WSLg (Linux) | HX29; shim: `windowControls: undefined` | `{ hx: "HX29" }` |
| `f12-shortcut`, `f12ShortcutActive` | F12 как назначаемая клавиша | подключено 3G.23 (наши каналы `f12-shortcut:*` в preload) | `{ ours: "f12-shortcut" }` обе |
| `minimize-to-tray` | трей | подключено 3G.23 (наш канал `minimize-to-tray:*`) | `{ ours: "minimize-to-tray" }` |
| `embed-host` | локальный http-источник для встроенного YouTube (`getEmbedHostOrigin`) | **только комментарий в shim** (T20.7), HX нет | см. вопрос 1 |
| `local-backend` | `probeLocalBackend` — переключатель «эта машина / удалённый шлюз» | **только комментарий в shim** | см. вопрос 1 |
| `preview-guest-hidden` | скрытие гостя предпросмотра за кадром (`setPreviewGuestHidden`) | **только комментарий в shim** | см. вопрос 1 |
| `external-open-failed` | сигнал «ссылку открыть не удалось» (`onExternalOpenFailed`) | **только** запись «(11)» в `donor-members.test.ts` (наш `openExternal` отклоняет промис сам) | см. вопрос 1 |
| `keep-awake-offer` | разовое предложение «не давать машине спать» после сна посреди хода (`onKeepAwakeOffer`) | **только** запись «(12)» в `donor-members.test.ts` (наш main сон не отслеживает) | см. вопрос 1 |

Прогон патченой копии (4 устаревших строки удалены, 17 добавлены: 8 через `hx`, 3 через `ours`, 6 через `ourWay` на shim — `terminal` и пять каналов из вопроса 1):
`ТАБЛИЦА УСТАРЕЛА` исчезает, `РАСХОЖДЕНИЕ (0)`, `есть у нас 102`, `исключено 28`, exit 0.

### 1.2 `tool-registry.mjs` (инструменты ядра)

Этот реестр сам не знает `--gate`: красный при любом расхождении или устаревшем вердикте.

| Запись | Что | Почему красная | Решение |
|---|---|---|---|
| `spotify_*` (стр. 187) | вердикт `excluded HX11` | «ВЕРДИКТ БЕЗ ИНСТРУМЕНТА»: ядро 0.22.2 больше не отдаёт эти инструменты (каталог `plugins/spotify` в дереве ядра пуст, в `tools/` Spotify нет) | механически: удалить строку |
| `ha_*` (стр. 188) | то же для Home Assistant | то же | механически: удалить строку |
| `set_theme` (набор `desktop_ui`) | агент меняет тему приложения | «решения нет». Решение есть: контракт §4 «берём; `set_theme` — инструмент ядра, в списке отложенных»; обработчики `theme.apply`/`theme.pick` лежат в донорском `server-requests.ts`; в `CORE_DEFERRED_TOOLS` (agent-defaults-pure.ts) | механически: `{ status: "ours", where: "контракт 0.22.2 §4; обработчики theme.apply/theme.pick в donor/.../gateway-event/server-requests.ts; отложенный инструмент (agent-defaults-pure.ts)" }` |
| `setup_beat` (набор `onboarding`) | карточки их онбординг-чата | «решения нет». Решение есть: HX26 (их онбординг не берётся; `components/assistant-ui/setup-beat/**` вендорится мёртвым, контракт §4) | механически: `{ status: "excluded", hx: "HX26", where: "их онбординг-чат; набор подмешивается только в онбординг-чат" }` |
| `manage_catalog` (набор `catalog`) | агент просит установить плагин/навык из каталога через карточку согласия (только GUI-сессии) | «решения нет». Косвенно решено HX29 («установка агентом из каталога (UR23)» берётся) и UR23, но **обработчика в донорском `server-requests.ts` я не нашёл**, и работоспособности пути нет доказательства | **вопрос 2 владельцу** |

Прогон патченой копии (две удалены, `set_theme`/`manage_catalog` как `ours`, `setup_beat` как `excluded HX26`): РАСХОЖДЕНИЕ (0), exit 0.

### 1.3 `platform-registry.mjs` (входы мессенджеров)

| Запись | Что | Почему красная | Решение |
|---|---|---|---|
| `homeassistant` (стр. 132) | вердикт `excluded HX11` | «ВЕРДИКТ БЕЗ ПЛАТФОРМЫ»: ядро больше не отдаёт этот вход (в дереве ядра `plugins/platforms/homeassistant` пуст) | механически: удалить строку |

Всё остальное зелёное: РАСХОЖДЕНИЕ (0), 32 канала в каталоге. Прогон патченой копии: exit 0.
Замечание: при запуске ядро печатало `Failed to load plugin 'aec-secret-filter': load timed out after 10s` —
под нагрузкой (параллельная сборка инсталлятора). Список платформ при этом не пострадал
(прогон до патча и после дал одно и то же), но результат реестра платформ зависит от того, успеет ли
ядро подняться; перепроверить на свободной машине.

### 1.4 Что нужно решить владельцу

**Вопрос 1. Пять каналов их главного процесса, по которым нет записи решения (только комментарии в коде).**
`embed-host` (встроенный YouTube со своего источника), `local-backend` (переключатель «эта машина / удалённый шлюз»),
`preview-guest-hidden` (скрытие гостя предпросмотра), `external-open-failed` (диалог «ссылку открыть не удалось»),
`keep-awake-offer` («не давать машине спать?» после сна посреди хода).
Правило фазы: новое расхождение выносится владельцу, а не закрывается задачей, которая его нашла. Все пять сейчас
**не перенесены** (члены `undefined`, подписки — честная отписка), решение принято инженерно в T20.7.
Варианты:
- A. Подтвердить «не берём / обходимся» для всех пяти и записать как строки `ourWay` (shim). Цена: у человека нет диалога
  при неудавшемся открытии ссылки (остаётся отказ промиса) и нет подсказки про сон после ночного отключения; YouTube встраивается
  по-старому.
- B. Подтвердить A, кроме `keep-awake-offer` и/или `external-open-failed`: завести задачу на перенос (мелкая, главный процесс).
- C. Оформить новым HX в SPEC (тяжёлее, смысла нет, пока решение «обходимся»).
Рекомендация: **A**; B для `keep-awake-offer` — по желанию после MVP: длинный ход агента, прерванный сном ноутбука, реальная
жалоба инженера, но это улучшение, а не разрыв.

**Вопрос 2. `manage_catalog` — инструмент ядра, которым агент просит поставить плагин/навык (карточка согласия).**
Варианты:
- A. Берём под доверием UR23: строка `ours` после проверки одним живым прогоном, что карточка согласия реально появляется в нашем окне
  и без согласия ничего не ставится (проверка — отдельная небольшая задача; обработчика в `server-requests.ts` я не нашёл).
- B. Исключаем новым HX (агент не ставит плагины/навыки сам; ставит человек из каталога): инструмент уже в списке отложенных,
  поэтому для модели он по умолчанию скрыт.
- C. Оставить расхождением до MVP.
Рекомендация: **B на предрелиз** (граница доверия R11 / HX5: «загрузчик плагинов выключен»; самовольная установка расширений агентом
— расширение поверхности исполнения кода, а HX29 писался про установку человеком из каталога через наше окно), A — после MVP, когда
будет прогон. Это моё прочтение; SPEC HX29 формулировка «берётся» двусмысленна, потому и вопрос.

(Всё остальное в §1 — механическое и подкреплено существующими решениями. Исключение — оформление `terminal`: если владелец захочет,
чтобы «HX7-прим.» стал читаемым реестром номером, потребуется правка SPEC; я рекомендую `ourWay`, чтобы SPEC не трогать.)

### 1.5 Проводка скрипта и формулировка Check в T37

`package.json`: `"parity": "node …parity-registry.mjs && node …tool-registry.mjs && node …platform-registry.mjs"`.
`pnpm parity -- --gate` дописывает `"--" "--gate"` **только в хвост — к `platform-registry.mjs`** (видно в первой строке вывода:
`node runtime/platform-registry.mjs "--" "--gate"`). `parity-registry.mjs` флага не получает и ведёт себя как без него:
красный и при расхождениях (`gaps`), и при устаревших строках. Кроме того, `tool-registry` и `platform-registry` `--gate` не знают вовсе.
Для T37 это значит: Check «`pnpm parity -- --gate` отдаёт 0» после применения §1.1–1.4 пройдёт (расхождений не останется), но
сам флаг не работает; точнее писать `pnpm parity` (без флага) либо `node runtime/parity-registry.mjs --gate`.
Править скрипт не предлагаю в рамках T37 (замечание для координатора).
После правок таблиц надо прогнать тесты реестров: `node --test runtime/parity-registry.test.mjs runtime/tool-registry.test.mjs runtime/platform-registry.test.mjs` (я их не запускал и не знаю, зашиты ли в них счётчики строк).

---

## 2. Аудит зависимостей

### 2.1 `pnpm audit --prod`

`14 vulnerabilities found — 1 low (1 ignored) | 4 moderate (4 ignored) | 8 high (8 ignored) | 1 critical (1 ignored)`, exit 0.
Состав 14: `tar@6.2.1` — 12 записей (GHSA-23hp-3jrh-7fpw крит., 8 высоких, 3 средних), `uuid@8.3.2` — GHSA-w5hq-g745-h8pq (средняя),
`katex@0.16.47` — GHSA-238p-pmpm-9mq7 (низкая). Неигнорируемых нет. Снял ignore в копии (см. ниже) — 14 те же, ничего нового.
Электрона нет, потому что он devDependency — как и записано в T37.

### 2.2 Исключение GHSA-w5hq-g745-h8pq (uuid@8.3.2) — рекомендую ПОДТВЕРДИТЬ

- Записано в `pnpm-workspace.yaml`: `auditConfig.ignoreGhsas` (стр. 142) и обоснование в комментарии (стр. 61–70, задача 4D-17).
- Совет: `uuid <11.1.1`, исправлено в `>=11.1.1` (v3/v5/v6 без проверки границ буфера, когда передан `buf`).
- Остаётся ли в замыкании: да. Единственный путь — `exceljs@4.4.0 → uuid ^8.3.0`; в lock также `uuid@14.0.1` (другой родитель).
- Достижимость: единственное место использования — `exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`, вызов `uuidv4()` без аргументов (я это перечитал в установленном пакете:
  строки 43 и 77), путь записи. Наш `sheet-read.ts` читает (`xlsx.readFile` / `xlsx.load`), `v4` с буфером не вызывается нигде. Недостижимо.
- Условие пересмотра «exceljs расширил диапазон»: НЕ наступило. `exceljs` latest = 4.4.0 (с ^8.3.0); предрелизная 4.4.1-prerelease.0 тоже держит `uuid ^8.3.0`.
- Вариант «снять»: override `uuid@8: ^11.1.1` (мажорный скачок под родителем, только ради недостижимой дыры). Не рекомендую.
  uuid 12+ уже не CJS — `require('uuid')` из exceljs сломался бы.
- Вывод: **подтвердить**, записать дату 2026-10-19 и повод «при подъёме exceljs / перед выпуском» выполнен этим пунктом.
- Остальные игнорируемые записи, для полноты: `tar@6.2.1` (12) — через `get-windows → @mapbox/node-pre-gyp@1.0.11 → tar ^6`. Замечание, которого нет в комментарии:
  `electron-builder.config.cjs` исключает из поставки только `node-gyp`/`node-addon-api`, а `@mapbox/node-pre-gyp` с `tar@6.2.1` **физически лежит в app.asar**
  (замыкание `get-windows`). Но `get-windows` зовёт только `preGyp.find`, а он идёт через `./pre-binding` без `tar`; `tar` подгружается лишь командами
  `install`/`package`/`testpackage` (`require('./' + command)`). Обоснование «в пути исполнения не участвует» остаётся верным; уточнить формулировку «в дереве поставки лежит» — да, лежит.
  `katex@0.16.47` (низкая) — подтверждаю как есть (исправлено только в 0.18.2+; повод снятия — подъём донора или расширение диапазона mermaid).

### 2.3 Полный `pnpm audit` — 21 новая находка (совпадает с T37)

Все 21 находятся в devDependency-дереве (сборка, тесты, инструменты). Группировка:

| Пакет (версия в lock) | Находок | Советы | Исправлено в | Как закрыть | Достигает поставки? |
|---|---|---|---|---|---|
| `electron@43.0.0` | 4 (все high) | GHSA-gr2m-v5gq-v685, GHSA-j84w-jfhq-vhvj, GHSA-9qh4-3jw8-366w (до 43.4.1); GHSA-qmv3-fv6v-rmhq (до 43.5.0) | 43.4.1 / 43.5.0 | подъём версии — §4 | **Да, это среда выполнения** (не в `--prod`, потому что devDependency) |
| `undici@7.29.0` (через `@electron/get`, `jsdom`, `vitest>jsdom`) | 10 (high 2: GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3; mod 6; low 2) | GHSA-3wwx-pv8p-q78v, pmjh-fq2x-6v4x, r53p-7pc4-xj5r, rfgv-xxqx-mfg5, 3xpg-4rpp-hhhm, 2jfj-6hjv-fm6j, 2gqq-gqf2-x968, w293-vg96-wgc3, 8436-99hf-9mmv, rx4f-c7p8-82vq | 7.29.1 | поднять существующий override `undici@7` с `^7.29.0` на `^7.29.1` (патч в том же мажоре) | Нет (скачивание Electron при сборке; тесты jsdom) |
| `browserslist@4.28.4` | 2 high (GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g) | | 4.28.7 | обновить lock (`pnpm update browserslist`, родители — `@babel/core` и т. п. с `^`) | Нет (vite/babel, сборка) |
| `baseline-browser-mapping@2.10.42` | 1 mod (GHSA-w5vr-8v7q-w6rv) | | 2.11.0 | обновить lock, то же | Нет |
| `vitest@4.1.9` + `@vitest/mocker@4.1.9` | 2 строки, 1 совет (GHSA-82fw-gwwq-j7x9, mod, чтение файла через redirect-mock) | | 4.1.11 | `pnpm update vitest` (диапазон `^4.1.0` разрешает), кэш показывает 4.1.12 | Нет (тесты) |
| `sprintf-js@1.1.3` (через `electron-builder … @electron/get>global-agent>roarr`) | 1 mod (GHSA-hp3w-g68c-fv3c, DoS через точность) | | **исправленной версии нет** (≥1.1.4 обещана; latest = 1.1.3) | записать, как уже записано в `pnpm-workspace.yaml` (стр. 52–54); добавить `GHSA-hp3w-g68c-fv3c` в `ignoreGhsas` с этим обоснованием | Нет (инструмент сборки; в замыкании exceljs/get-windows его нет) |
| `postcss-selector-parser@6.0.10` (через `@tailwindcss/typography`) | 1 mod (GHSA-rj75-hqrm-r3gf, квадратичная сложность) | | 7.1.6 | **только форсированный мажор 6→7** под родителем, просящим 6; рекомендую запись в `ignoreGhsas` + повод «при подъёме `@tailwindcss/typography`»: разбор селекторов идёт на сборке CSS по нашему же коду, внешнего входа нет | Нет (генерация CSS) |

Итого после `undici` override + `electron` + `pnpm update browserslist baseline-browser-mapping vitest`: остаётся 2 записи (sprintf-js, postcss-selector-parser) — обе в `ignoreGhsas`.

Проверка плана: lock фиксирует `undici@7.29.0`, `browserslist@4.28.4`, `baseline-browser-mapping@2.10.42`, `vitest@4.1.9`; оба последних тоже внутри заявленных `^`-диапазонов родителей. Доступность версий проверена только по метаданным кэша pnpm (7.29.1 присутствует, `4.28.7` — latest у browserslist); перед выполнением план надо подтвердить живым `pnpm audit` после обновления. Сработает ли `minimumReleaseAge` (в workspace есть `minimumReleaseAgeExclude`) на свежих версиях, я не проверял.

---

## 3. Лицензии

Метод: обход замыкания зависимостей (`dependencies` + `optionalDependencies`) через `node_modules/.pnpm` (реальные пути, поиск ближайшего `node_modules`); поля `license` и файлы `LICENSE*`.
Для Python — все `*.dist-info/METADATA` (`License-Expression`, `License`, `Classifier: License ::`) + файлы лицензий внутри dist-info.
Две раскладки: `runtime/core/venv/Lib/site-packages` (104 дистрибутива) и `runtime/mcp/python/Lib/site-packages` (157). Поля `license` — декларация пакета, не юридическое заключение.

### 3.1 `buffers@0.1.1` — лицензии нет нигде

- Подтверждено на диске: `package.json` без `license`, в каталоге пакета только `README.markdown`, `index.js`, `examples`, `test`; файла лицензии нет.
  Апстрим `github.com/substack/node-buffers` — 404, версия одна (0.1.1, 2011) — записано в `pnpm-workspace.yaml` (стр. 80–94).
- Цепочка: `exceljs@4.4.0 → unzipper@0.10.14 → binary@0.3.0 → buffers ~0.1.1` (+ `chainsaw`, `traverse`). `binary@0.3.0` сам заявлен MIT (substack).
- В поставку едет: в `MAIN_RUNTIME_PACKAGES` лежит `exceljs`, замыкание тянет все `dependencies`, `unzipper` грузится на старте (`exceljs/lib/stream/xlsx/workbook-reader.js:5` — `require('unzipper')`).
  Реально код `buffers` исполняется только стримовым читателем XLSX; мы им не пользуемся (читаем `xlsx.readFile`/`xlsx.load` через jszip) — но файлы в поставке.
- Риск: неопределённое право на ~7 КБ чужого кода, распространяемого в инсталляторе; практическая вероятность претензий мала (автор — substack, весь остальной код MIT), но решение «принять» — решение о нарушении C3 («только permissive»), ему нужен владелец.
- **Вариант снятия (рекомендую): `overrides: unzipper@0.10: 0.12.5`.** Версии ≥0.11 `binary`/`buffers` не используют (метаданные: у 0.11.x нет `binary`, у 0.12.x зависимости — bluebird, duplexer2, fs-extra, graceful-fs, node-int64).
  `unzipper@0.12.5` **уже есть в lock** (через `electron-builder > app-builder-lib`), нового пакета не появится. Из замыкания уйдут `buffers`, `binary`, `chainsaw`, `traverse` (MIT/X11 с файлом), `big-integer`.
  Сама `exceljs` 4.4.1-prerelease.0 уже просит `unzipper ^0.11.2` — то есть сопровождающие движутся туда же. Требует: слова владельца на смену зависимости (override под мажор-нулевой родительский `~0.10`), `dependency-vetting` перед правкой,
  проверки `sheet-read.test.ts`, сборки `electron-vite build`, e2e-теста чтения XLSX и `pnpm audit`.
- Другие варианты: принять как есть (запись в workspace уже есть, владелец решение не принял); уйти с exceljs (дорого: читаем XLSX в UR2); исключить пакет из asar (нельзя — `binary` требует его при загрузке `unzipper`).
- Рекомендация: **override на unzipper 0.12.5**, запасной вариант — принять с явной записью.

### 3.2 agent-browser 0.26.0 (инструмент их PM ядра)

- Лежит в `runtime/core/tools/agent-browser-0.26.0-win32-x64/`: `package.json` `"license": "Apache-2.0"`, файл `LICENSE` — полный текст Apache License 2.0 (10 931 байт); репозиторий `github.com/vercel-labs/agent-browser`.
  Отдельного `NOTICE` нет. Лицензию переписывать нечего: Apache-2.0, в поставке текст есть. → **годится**.
- `bin/agent-browser-win32-x64.exe` (10,6 МБ) — собранный Rust-бинарник; лицензии статически влинкованных крейтов в пакете не перечислены (в каталоге нет ни `THIRD_PARTY`, ни SBOM). Это общее свойство; если нужен перечень — запросить у репозитория agent-browser (`cargo`-манифест), локально его нет.
- Рядом в `runtime/core/tools`: `chromium-1208` (Chromium 145.0.7632.6) — **файла лицензий/credits в каталоге нет** (BSD-3-Clause плюс сторонние; бинарная раздача BSD требует текста лицензии), `git-2.53.0+3` (GPLv2, решено владельцем 2026-10-16: C3, отдельная программа; `LICENSE.txt` лежит, файла со ссылкой на исходники, кроме `README.portable`, не нашёл — C3 её требует),
  `node-26.7.0` (MIT, LICENSE есть), `python-3.14.7` (PSF, LICENSE.txt есть), `ripgrep-15.2.0` (MIT/Unlicense, LICENSE-MIT есть), `npm-12.0.2` (Artistic-2.0; `LICENSE` лежит в `node_modules/npm`), `uv-0.12.3` (MIT/Apache-2.0; в каталоге только `uv.exe/uvw.exe/uvx.exe`, **файла лицензии нет**).
  Для Chromium стоит добавить в экран лицензий/файл поставки ссылку на `chrome://credits`-эквивалент или текст BSD — это пункт для T22/T36 (оформление лицензий), не для T37.

### 3.3 Прод-замыкание npm в поставке

Замыкание `exceljs` + `get-windows` (то, что реально кладётся в app.asar по `electron-builder.config.cjs`; мой обход включает ещё `node-gyp`-ветку, которую сборка выкидывает, поэтому числа чуть завышены): **198** пакетов.
Распределение: MIT 120, ISC 57, BSD-3-Clause 3, BSD-2-Clause 2, Apache-2.0 4, BlueOak-1.0.0 6, MIT/X11 2, Unlicense 1, (MIT AND Zlib) 1, (MIT OR GPL-3.0-or-later) 1, **нет лицензии 1 (buffers)**.
Вне четырёх разрешённых по C3 названий:

| Пакет | Лицензия | Комментарий |
|---|---|---|
| `buffers@0.1.1` | **нет** | §3.1 |
| `jszip@3.10.1` | MIT OR GPL-3.0-or-later | выбираем MIT; GPL-ветка нас не обязывает |
| `pako@1.0.11` | MIT AND Zlib | разрешительные; Zlib — permissive |
| `big-integer@1.6.52` | Unlicense | public domain-подобная, permissive |
| `chainsaw@0.1.0`, `traverse@0.3.9` | MIT/X11 | = MIT; у `chainsaw` нет файла лицензии, лицензия — в поле |
| 6 пакетов BlueOak-1.0.0 | BlueOak-1.0.0 | permissive (рядом с MIT/ISC); не в списке C3 дословно — фиксируем как permissive |

Без файла лицензии (но с полем `license`): `@npmcli/agent`, `agent-base`, `binary`, `buffers`, `chainsaw`, `eastasianwidth`, `err-code`, `https-proxy-agent`, `imurmurhash`, `isarray`, `saxes`, `tr46` — 12 пакетов; для MIT/ISC раздача без текста лицензии формально не соблюдает условие «включить уведомление» (если экран лицензий собирается из этих файлов, эти 12 придётся подставить из шаблона SPDX). Отметить для оформления экрана лицензий.

Renderer-замыкание (всё из `dependencies` apps/desktop, вшито vite-ом в бандл): **750** пакетов — MIT 606, ISC 100, Apache-2.0 11, BSD-3 12, BSD-2 4, BlueOak 6, 0BSD 1, Unlicense 2, MIT/X11 2, CC-BY-4.0 1 (`@vscode/codicons`, оговорено в C3 с указанием авторства), `(MPL-2.0 OR Apache-2.0)` 1 (`dompurify` — берём Apache-2.0), `(MIT OR GPL-3.0-or-later)` 1 (jszip), `(MIT AND Zlib)` 1, нет поля 2 (`buffers`; `khroma@2.1.0` — поле отсутствует, но файл `license` — MIT, проверено в D-55).

GPL/AGPL/LGPL/SSPL в npm-замыканиях как основная лицензия: нет.

### 3.4 Python-замыкание (core venv и MCP-питон)

Основные лицензии: MIT, BSD-2/3, Apache-2.0, PSF, ISC, MIT-0, Zlib, 0BSD, CC0 — подавляющее большинство. Сводка отклонений:

| Пакет | Где | Лицензия | Оценка |
|---|---|---|---|
| `certifi@2026.5.20`/`2026.6.17` | core, mcp | **MPL-2.0** | слабый copyleft (на уровне файла); раздаётся без правок — допустимо, внести в список лицензий поставки |
| `pathspec@1.1.1` | core | **MPL-2.0** | то же |
| `tqdm@4.70.0` | core, mcp | **MPL-2.0 AND MIT** | то же |
| `shapely@2.1.2` | mcp | BSD-3-Clause; в колесе `shapely.libs/geos*.dll` — GEOS под **LGPL-2.1** (`LICENSE_GEOS`) | LGPL, динамически подключаемая DLL в колесе |
| `opencv-python@5.0.0.93` | mcp | Apache-2.0; в колесе `cv2/opencv_videoio_ffmpeg500_64.dll` — FFmpeg под **LGPL** (в `LICENSE-3RD-PARTY.txt`: «FFmpeg is redistributed within all opencv-python packages») | то же; GPL-кодировщиков в LICENSE-3RD-PARTY я не нашёл (упоминания GPL — в тексте LGPL), но это строка-поиск, не проверка бинарника |
| `resvg_py@0.4.0` | core | в метаданных поля нет; файл лицензии — MIT (baseplate-admin) | враппер MIT; сам `resvg` (Rust, статически) — отдельная лицензия, в колесе есть каталог `sboms` — перечень можно прочитать оттуда |
| `numpy`, `scipy`, `pillow`, `torch`, `grpcio`, `pywin32`, `typing_extensions`, `aiohappyeyeballs`, `et_xmlfile`, `pip` | оба | основная — permissive | В файлах лицензий — тексты GPL/LGPL/AGPL как **сторонних компонентов или исторических справок** (GCC runtime exception для libgfortran в numpy/scipy, FreeType FTL/GPLv2 у Pillow, история Python у pywin32 и т. д.). Основная лицензия permissive; это не зависимость под GPL |
| `pypdfium2@5.12.1` | mcp | BSD-3-Clause, Apache-2.0 + лицензии зависимостей | permissive |
| `regex` | mcp | Apache-2.0 AND CNRI-Python | permissive |
| `python-dateutil` | оба | «Dual License» (Apache-2.0/BSD) | permissive |
| `socksio` | core | «UNKNOWN» в метаданных, файл LICENSE есть | проверить текст (BSD-подобный) — не читал |
| `aec-rag`, `aec-roster`, `aec-sources` | mcp | наши собственные пакеты, лицензии нет | наш код |

`pillow-heif`/`libx265` — в обеих раскладках **нет** (решение владельца 2026-09-15 соблюдено). GPL/AGPL/SSPL-**пакетов** не найдено; без лицензии — только собственные `aec-*`.

Граница с C3: C3 разрешает LGPL только по отдельному решению (прецедент — pillow-heif, затем не использован). Присутствие LGPL-библиотек в MCP-питоне (GEOS в shapely, FFmpeg в opencv-python) и MPL-2.0 в certifi/pathspec/tqdm в SPEC как допуски **не записано**.
Условия прецедента (пакет permissive, GPL-компонентов нет, лицензии записаны в PLAN §Selected dependencies) выполняются; подмена колеса не нужна.

### 3.5 Что решить

**Вопрос 3 владельцу.** Допустить в поставку (а) LGPL-библиотеки в колёсах MCP-питона: GEOS (shapely), FFmpeg (opencv-python) — динамически подключаемые DLL, неизменённые, и (б) MPL-2.0 (certifi, pathspec, tqdm) — как неизменённые зависимости, с записью в PLAN §Selected dependencies и экране лицензий?
Варианты: A — допустить на условиях прецедента C3 (LGPL динамически, неизменённая, лицензия и ссылка на исходники в поставке); B — убрать пакеты (opencv-python/shapely нужны docling/ingest — вероятно, нет); C — принять только после проверки, что FFmpeg-сборка opencv без GPL-кодеков.
Рекомендация: **A**, так как это тот же класс, что допущен для pillow-heif (3.B5е); записать оба в PLAN и приложить тексты лицензий.

---

## 4. Electron

- Lock: `electron@43.0.0` (`pnpm-lock.yaml` стр. 3522 и 9770); `apps/desktop/package.json`: `"electron": "^43.0.0"` (диапазон уже разрешает любую 43.x, дело только в lock).
- Советы и исправления (из `pnpm audit`): GHSA-gr2m-v5gq-v685, GHSA-j84w-jfhq-vhvj, GHSA-9qh4-3jw8-366w — исправлены в **43.4.1**; GHSA-qmv3-fv6v-rmhq — в **43.5.0**.
  **Минимальная исправленная версия, закрывающая все четыре: 43.5.0.**
- Кэш метаданных npm (2026-10-17): линия 43.x доходит до **43.8.0** (опубликована 2026-10-16); `latest` — 44.8.0. Из кэша же: 43.5.0 (2026-08-31), 43.5.1, 43.6.0, 43.7.0–43.7.11, 43.8.0. Все требуют Node ≥ 22.12.
- **Рекомендуемая цель: `43.8.0`** (последняя в линии 43). Если важнее минимальное изменение — `43.5.0`. На выполнении подтвердить живой выдачей (`corepack pnpm view electron@43 version`).
  Не `--latest`: он перейдёт на 44.x, а это отдельный подъём.
- Какие советы нас касаются: в `main/index.ts:1642` окно создаётся с `webviewTag: true` — то есть GHSA-9qh4-3jw8-366w («`<webview>` может включить Node.js в Web Worker вопреки настройкам») относится к нашей поверхности браузерных вкладок/предпросмотра (UR22/UR31). Кастомные протоколы есть (`media-proxy.ts` — `registerSchemesAsPrivileged`), обработчик `protocol.handle` — GHSA-j84w-jfhq-vhvj («File and HTTP protocol handlers allow cross-origin reads…») надо прочитать по тексту, к какому именно API он относится. `sandbox: true` держим (THREAT_MODEL), значит GHSA-qmv3-fv6v-rmhq (отравление кода-кэша песочницы) требует уже скомпрометированного рендерера.
- Что изменится при подъёме: `apps/desktop/package.json` (желательно поднять нижнюю границу `^43.8.0`, чтобы lock не мог откатиться), `pnpm-lock.yaml` (запись `electron@43.x` и, возможно, `@electron/get`, `@types/node`), бинарь Electron скачивается постустановкой (`onlyBuiltDependencies: electron`) — нужна сеть, место в кэше `@electron/get`, а `electron-builder.config.cjs` берёт `electronVersion` и `electronDist` из установленного пакета (`electronPackage.version`), отдельной правки не требует.
  `get-windows` — N-API-прибинарник (`npmRebuild: false`), в пределах 43.x ABI стабилен.
- План (команды НЕ выполнялись):
  1. Подтвердить версию: `corepack pnpm view electron@43 version`.
  2. `corepack pnpm -C apps/desktop add -D electron@^43.8.0` (или править строку `package.json` и `corepack pnpm install`; ставить на машине, где координатор не собирает инсталлятор — `apps/desktop/release` и `node_modules` заняты).
  3. В том же коммите, одним подъёмом: `undici@7: '^7.29.1'` в overrides; `corepack pnpm update browserslist baseline-browser-mapping vitest` (по §2.3).
  4. Проверить: `corepack pnpm audit` (ожидаем 2 неисправимых, их записать в `ignoreGhsas`), `corepack pnpm audit --prod` (0, как сейчас).
  5. `corepack pnpm lint` (typecheck, eslint, prettier), `corepack pnpm test` (vitest, вкл. `sheet-read.test.ts`), `corepack pnpm -C apps/desktop build`.
  6. e2e: полный `pnpm e2e` ×3 на одной сборке (правило проекта: меньше трёх прогонов вывода не дают) + `pnpm e2e:acceptance`; обратить внимание на окно браузера/предпросмотра (`<webview>`), `media`-схему, окно быстрого ввода, HUD, перетаскивание/диалоги, вывод в `get-windows`.
  7. Пересобрать инсталлятор (T22: `dist:win`) и пройти установку на имитации чистой машины в `D:\AECPilot-cleantest` (правило владельца); убедиться, что установленная сборка стартует и версия Electron в `about`/`process.versions.electron` равна целевой.
  8. Записать в T37: версия, выход `pnpm audit`, результаты e2e.

---

## 5. Предлагаемый порядок работ для T37 (после ответов владельца)

1. Реестры: 4 правки устаревшего + 17 строк каналов (без 5 по вопросу 1), `spotify_*`/`ha_*`/`homeassistant` удалить, `set_theme`/`setup_beat` — строки, `manage_catalog` — по вопросу 2. Прогон трёх реестров и их `*.test.mjs`.
2. Аудит: подтвердить uuid-исключение; добавить `GHSA-hp3w-g68c-fv3c` (sprintf-js) и `GHSA-rj75-hqrm-r3gf` (postcss-selector-parser) в `ignoreGhsas` с обоснованием; override undici; обновить lock.
3. Electron 43.8.0 и e2e ×3 — одним блоком (требует установки: нужно разрешение на действие).
4. Лицензии: `buffers` (override unzipper — по слову владельца), запись про LGPL/MPL (вопрос 3), Chromium credits, 12 пакетов без файла лицензии.
5. Результат — в строку T37 (`Result: passed — …`), этот отчёт — ссылка.

Вопросы владельцу, в сводке: (1) пять каналов без решения; (2) `manage_catalog`; (3) LGPL/MPL в колёсах MCP-питона; плюс отдельное решение по `buffers` (§3.1) и разрешение на установку/обновление зависимостей (Electron, undici, vitest, browserslist).
