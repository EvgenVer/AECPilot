// Generates the parity registry AC9 asks for: every capability Hermes has,
// sorted into «есть у нас» / «исключено» / «запланировано» / «РАСХОЖДЕНИЕ».
// The last section is the product: AC9 is met when it is empty, and a capability
// can leave it only by being ported, by getting a §Non-Goals entry, or by
// getting a task — never by being forgotten.
//
// Takes a git ref, so the registry can be generated against a version we have
// NOT pinned. That is the point: the composition of Phase 3B has to be fixed
// once, against the tree we will actually port from, instead of being rewritten
// after every release (PLAN §Синхронность с релизом донора).
//
//   node runtime/parity-registry.mjs                      — против DONOR_SHA
//   node runtime/parity-registry.mjs refs/aecpilot/v0.20.2
//   node runtime/parity-registry.mjs <ref> --json out.json
//
// THE UNIT IS A SCREEN, NOT AN RPC METHOD, and that is a correction paid for by
// building it the other way first. Their `app/<name>/` is what a person gets.
// Their RPC surface is not a parity axis at all: `main/gateway-passthrough-pure.ts`
// is a GENERIC channel, so the renderer may name any method except the deny
// list — every one of the 165 is reachable by construction, and an inventory of
// them reports coverage we did not earn. What the methods still tell us is
// checked below instead: whether the surfaces §Non-Goals excludes are reachable
// anyway. That is a note, not a разрыв — exclusion is a product decision, the
// deny list is a security one, and conflating them hides both.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { RUNTIME_DIR } from "./hermes-env.mjs";
import { DONOR_ROOT, DONOR_SHA } from "./donor-env.mjs";
import { readVendorZone } from "./donor-report.mjs";

const REPO_DIR = path.resolve(RUNTIME_DIR, "..");
const SPEC_FILE = path.join(REPO_DIR, "SPECIFICATION.md");
const TASKS_FILE = path.join(REPO_DIR, "TASKS.md");
const DENY_FILE = path.join(REPO_DIR, "apps/desktop/src/main/gateway-passthrough-pure.ts");
const OUR_PRELOAD = path.join(REPO_DIR, "apps/desktop/src/preload/index.ts");

/** Why a surface we do not carry is not a разрыв. `hx` cites the §Non-Goals
 * entry that excludes it; `task` cites the TASKS id that will bring it;
 * `ourWay` says the capability IS ours but arrived by another road — and names
 * the file that proves it (the script checks the file exists, so «наше» never
 * becomes an unverifiable promise).
 *
 * `ourWay` was added by D-71, and the reason is worth keeping: 46 rows were
 * still answering «задача принесёт» about tasks closed months earlier, because
 * the capability HAD arrived — just not through their channel. Быстрый ввод
 * живёт в собственном preload, поиск по странице сделан в рендерере. Without a
 * way to say that, the only honest options were a lie and a разрыв.
 *
 * Hand-written on purpose. Matching SPEC prose against directory names would
 * produce a mapping nobody can audit, and the whole value of AC9 is that a
 * reader can check every line against the document. The integrity checks below
 * refuse to let the table go stale: a cited HX that SPEC lost, a cited task
 * TASKS lost, and an entry no row used are all reported. */
export const CLASSIFICATION = {
  "pet-generate": { hx: "HX1", note: "питомец и генерация его изображения" },
  "pet-overlay": { hx: "HX1", note: "питомец" },
  // СТРОКА «agents» УДАЛЕНА 2026-09-08 (задача 3E.14). Экран перенесён задачей
  // 3E.13: фазирование N10 снято решением владельца 05.09, доска и панель
  // агентов вошли в объём как UR38. Причина отсутствия, оставленная в таблице
  // после переноса, — это ложь в реестре, и скрипт её именно так и назвал.
  // Обе поверхности НАШИ и обе — своим окном со своим preload, поэтому их
  // экрана в зоне нет и никогда не будет (задачи 3.15 и 3.7b, обе закрыты).
  "quick-entry": {
    ourWay: "apps/desktop/src/preload/quick-entry.ts",
    note: "быстрый ввод по глобальному хоткею — своё окно, свой preload",
  },
  // «wake-indicator» — своё окно 3.7b — снято задачей 3H.3 вместе со всем
  // голосом (решение владельца 2026-10-07): теперь это исключение HX19.
  "wake-indicator": { hx: "HX19", note: "голос исключён целиком — табличка слова-активатора" },
  // СТРОКА «webhooks» УДАЛЕНА 2026-09-10 (задача 3.11, часть по коду): экран
  // перенесён и подключён, и причина отсутствия в таблице стала ложью — скрипт
  // назвал её сам («перенесена, но в таблице числится причина её отсутствия»).
  // Остальное в 3.11 кодом не закрывается: подпись A2A ждёт апстрима, обмен —
  // тестового партнёра.
};

/** The main-process half of parity (D-27). Their `electron/` is 100 modules, but
 * modules are not capabilities — most are plumbing whose equivalent our own main
 * implements differently. What IS comparable is the boundary each main exposes
 * to its renderer: their preload publishes 52 `hermes:<группа>:<действие>`
 * channels, ours publishes 34 `<группа>:<действие>` ones.
 *
 * The two channel sets were written independently, so names do not line up and
 * matching them mechanically would invent gaps where the capability exists under
 * another name. Hence this table: `ours` names OUR channel group, and the script
 * verifies it really exists in our preload — a claim that stops being true
 * becomes a reported problem instead of a quiet reassurance.
 *
 * Rows left out on purpose land in РАСХОЖДЕНИЕ. That is the honest state for a
 * capability whose counterpart I could not point at: «нужно решение», not
 * «наверное есть». */
export const ELECTRON_CLASSIFICATION = {
  // — их бэкенд-жизненный цикл; у нас свой запуск ядра
  backend: { ours: "gateway" },
  "backend-exit": { ours: "gateway" },
  "boot-progress": { ours: "setup" },
  bootstrap: { ours: "setup" },
  api: { ours: "gateway", note: "REST-дверь того же процесса" },
  gateway: { ours: "gateway" },
  // — файлы и рабочая папка
  fs: { ours: "sources", note: "reveal/rename/trash над деревом источников и vault" },
  workspace: { ours: "project" },
  profile: { ours: "profiles" },
  openExternal: { ours: "shell", note: "shell:open-external" },
  readFileText: { ours: "viewer", note: "viewer:read-document" },
  readFileDataUrl: { ours: "viewer" },
  readFileDataUrlForAttach: { ours: "attach" },
  selectPaths: { ours: "attach", note: "attach:pick — нативный диалог выбора" },
  readClipboard: { ours: "attach", note: "attach:paste" },
  writeClipboard: { ours: "attach" },
  saveClipboardImage: { ours: "attach" },
  savePastedText: { ours: "attach", note: "attachments:save-paste — большая вставка текста как .txt-вложение (0.21.3, 3.B5в)" },
  watchDirectory: { ours: "scan", note: "детект изменений источников, UR7" },
  setting: { ours: "settings" },
  "data-url-read-max": { ours: "settings", note: "лимит на встраиваемый файл" },
  // — исключено §Non-Goals
  cloud: { hx: "HX3", note: "вход в их облако" },
  "pet-overlay": { hx: "HX1" },
  git: { hx: "HX6", note: "голый git-UI; diff-вьюер приходит отдельно, задача 3.3" },
  terminal: {
    ourWay: "apps/desktop/src/renderer/src/shared/hermes-desktop-shim.ts",
    note: "панель живой оболочки снята задачей 3L.11 (HX7-прим., 2026-10-12): в shim `terminal: undefined`, терминал агента — инструмент ядра",
  },
  // — запланировано
  hud: { ours: "hud", note: "плавающая лента — задача 3.24" },
  "quick-entry": { ourWay: "apps/desktop/src/preload/quick-entry.ts", note: "своё окно со своим preload — задача 3.15" },
  "keep-awake": { ours: "power", note: "power:keep-awake — задача 3.18" },
  "wake-indicator": { hx: "HX19", note: "голос исключён целиком (3H.3)" },
  updates: { ours: "update", note: "update:check — уведомление о новой версии по нашему файлу версии (T42); их обновлятор не берётся (HX4)" },
  "open-updates": { ours: "update", note: "уведомление ведёт по ссылке из файла версии на новый установщик; своего окна обновлений нет (T42, HX4)" },
  connections: { ours: "connection", note: "реестр подключений — задача 3.12, UR20" },
  connection: { ours: "connection" },
  "connection-config": { ours: "connection" },
  "ssh-config": { ours: "connection", note: "connection:ssh-hosts / ssh-resolve" },
  // Их канал спрашивает у main: «почему эта поверхность выключена при удалённом
  // ядре». У нас спрашивать некого и незачем — причина не ВЫЧИСЛЯЕТСЯ в момент
  // вопроса, а ЗАПИСАНА: решение по каждой из семи поверхностей принято задачей
  // 3.13a (PLAN §«Удалённый режим»), а текст лежит в нашем каталоге
  // (`remoteTitle`/`remoteDetail`) и рисуется самой поверхностью. Круга к main
  // нет вовсе.
  "get-remote-display-reason": {
    ourWay: "apps/desktop/src/renderer/src/aec/explorer/VaultExplorer.tsx",
    note: "причина записана в каталоге и рисуется поверхностью — задача 3.13a"
  },
  // Поиск по странице сделан В РЕНДЕРЕРЕ (задача 3.16): ищет по ленте наш
  // же перенесённый стор, а не `webContents.findInPage`. Их четыре канала
  // существуют ради второго способа, которым мы не пользуемся.
  "find-in-page": { ourWay: "apps/desktop/src/renderer/src/donor/store/find-in-page.ts", note: "поиск по ленте в рендерере — задача 3.16" },
  "open-find-bar": { ourWay: "apps/desktop/src/renderer/src/donor/store/find-in-page.ts" },
  "stop-find-in-page": { ourWay: "apps/desktop/src/renderer/src/donor/store/find-in-page.ts" },
  "found-in-page": { ourWay: "apps/desktop/src/renderer/src/donor/store/find-in-page.ts" },
  // Третий вход задачи 3.8 (UR23) — установка по внешней ссылке. Канала у нас
  // НЕТ и быть не может: приложение не регистрирует ни одной схемы в ОС
  // (`app.setAsDefaultProtocolClient` не зовётся), и это стережёт тест ниже.
  // То есть отсутствие канала — не пробел, а следствие закрытого решения.
  "deep-link": { ourWay: "apps/desktop/src/main/no-protocol-client.test.ts", note: "схема в ОС не регистрируется — ссылке неоткуда прийти, задача 3.8" },
  "deep-link-ready": { ourWay: "apps/desktop/src/main/no-protocol-client.test.ts" },
  // Канал — НЕ экран. Их `hermes:agents:roster` перечисляет агентов всех
  // подключённых ядер (`store/fleet-roster.ts`), то есть это ФЛОТ, а флот
  // исключён HX22 поимённо: «три члена их плагинного `host` (`connections`,
  // `agents`, `profileRoutes`) остаются без моста намеренно». Экран агентов при
  // этом наш (3E.13) — он показывает агентов ОДНОГО подключения.
  agents: { hx: "HX22", note: "реестр агентов всех подключённых ядер — у нас одно подключение за раз" },
  // ЗАКРЫТИЕ ВКЛАДКИ С КЛАВИАТУРЫ У НАС ЕСТЬ, но их дорогой ходит не наша
  // платформа. Канал существует ради macOS: там есть меню приложения, ⌘W висит
  // ускорителем и приходит в main. Вне macOS их меню равно null — и путь идёт
  // через их же клавиатурный разбор в рендерере (`view.closeTab` →
  // `closeActiveTab`). Это записано их собственным комментарием в
  // `use-desktop-integrations.ts`, а не выведено нами.
  "close-preview-requested": {
    ourWay: "apps/desktop/src/renderer/src/donor/app/hooks/use-keybinds.ts",
    note: "Ctrl+W закрывает вкладку разбором в рендерере — их же путь для не-macOS"
  },
  // Флаг «панель предпросмотра в фокусе» СЕГОДНЯ НЕ РЕШАЕТ НИЧЕГО И У НИХ:
  // `electron/main.ts` его пишет (`hermes:previewShortcutActive`) и не читает
  // ни в одном месте, а там, где проверка стояла, остался их комментарий «no
  // `previewShortcutActive` gate, so it works for every closeable tab».
  // Перенос дал бы мёртвую половину механизма, живая половина которого — строка
  // выше.
  previewShortcutActive: {
    ourWay: "apps/desktop/src/renderer/src/donor/app/hooks/use-keybinds.ts",
    note: "их флаг ничего не гейтит на 0.21.0 — читателя у него в main нет"
  },
  // Живая перезагрузка предпросмотра по изменению файла. РАСХОЖДЕНИЕМ эти
  // четыре строки были до 2026-09-08 (замечание D-75): панель у нас ИХ (задача
  // 3E.12) и выключает слежение сама, если членов моста нет, — то есть поломки
  // не было, не было возможности. Задача 3E.25 её принесла, и цена названа: за
  // произвольным путём следить нельзя, только за тем, что главный процесс уже
  // показал человеку (`preview-watch-pure.ts`, дисциплина задачи 3.13b).
  watchPreviewFile: { ours: "preview", note: "preview:watch, 3E.25 — с проверкой границ" },
  stopPreviewFileWatch: { ours: "preview", note: "preview:stop-watch" },
  "preview-file-changed": { ours: "preview", note: "preview:file-changed" },
  normalizePreviewTarget: { ours: "preview", note: "preview:resolve-target — разбор пути в main" },
  // Кнопка «открыть в браузере». Расхождением была до 2026-09-08: их панель
  // отвечала отказом, потому что `lib/local-preview.ts` зовёт
  // `bridge.openPreviewInBrowser`, а моста не было. Закрыта задачей 3E.26 —
  // ОТДЕЛЬНОЙ дверью, а не расширением `shell:open-external`: та схему `file:`
  // запрещает нарочно, и расширить её значило бы раздать «открой любой файл»
  // каждому месту, которое её зовёт (`preview-external-pure.ts`).
  openPreviewInBrowser: { ours: "preview", note: "preview:open-external, 3E.26" },
  requestMicrophoneAccess: { hx: "HX19", note: "голос снят целиком (3H.3, 2026-10-07): канала media нет" },
  // Решение владельца 2026-09-08 (задача 3E.27): HX21 распространён на
  // заголовки ссылок и переформулирован в общее правило — «украшения, за которые
  // платят исходящим запросом в интернет». Вставленная ссылка становится
  // элементом (задача 3.17) и показывает адрес; их main при этом читал бы
  // страницу ради `<title>`. Своя цена этого случая, названная в SPEC: запрос
  // уходит в момент ВСТАВКИ, то есть сайт узнаёт о ссылке раньше, чем по ней
  // кто-то перешёл.
  fetchLinkTitle: { hx: "HX21", note: "заголовок страницы для вставленной ссылки — показываем адрес" },
  window: { ours: "window", note: "несколько окон — задача 3.14" },
  // — решения владельца 2026-08-16 (интервью по разрыву, найденному этим реестром)
  zoom: { ours: "zoom", note: "зум — доступность, задача 3.26" },
  "native-theme": { ours: "theme", note: "theme:set-native — задача 3.26" },
  translucency: { hx: "HX14", note: "прозрачность окна" },
  "titlebar-theme": { hx: "HX14" },
  "vscode-theme": { hx: "HX14", note: "импорт чужого конфига с диска" },
  selectSavePath: { ours: "dialog", note: "dialog:select-save-path — задача 3.27" },
  saveImageBuffer: { ours: "save", note: "save:image — задача 3.27" },
  saveImageFromUrl: { ours: "save", note: "save:image" },
  saveGatewayFile: { ours: "save", note: "save:file" },
  notify: { ours: "notify", note: "notify:show — задача 3.28" },
  "notification-action": { ours: "notification", note: "notification:action" },
  "power-battery": { ours: "power", note: "power:battery-changed / on-battery" },
  "power-resume": { ours: "power", note: "power:resume" },
  logs: { ours: "log", note: "падение рендерера должно пережить окно — задача 3.29" },
  uninstall: { task: "T30" },
  "active-work": { ours: "active-work", note: "задача 3E.11" },
  ambient: { ours: "ambient", note: "фоновые подсказки — задача 3E.11" },
  devtools: { ours: "devtools", note: "запрет F12 — задача 3E.11" },
  version: { ours: "version", note: "версия НАША, SPEC C12 — задача 3E.11" },
  "window-state-changed": { ours: "window" },
  "focus-session": { ours: "notification", note: "notification:focus-session" },
  "open-folder-requested": { ours: "project", note: "project:opened / pick-directory" },
  // — подъём на 0.21.0 (задача 3.B3з). Единственная новая строка за всё окно, и
  //   расхождением она НЕ оказалась (задача 3.B3к, решение владельца
  //   01.09.2026). Реестр сравнивает методы шлюза с нашими каналами и потому
  //   назвал разрывом новое RPC-трио `mcp.servers.oauth.{start,poll,callback}`.
  //   Замер вызовом показал другое: их собственный экран MCP-серверов этим трио
  //   не пользуется вовсе — он ходит по REST (`POST /api/mcp/servers/{n}/auth`,
  //   опрос `GET /api/mcp/oauth/flows/{id}`), а страницу возврата от провайдера
  //   отдаёт само ядро. Через нас проходит только открытие ссылки в браузере.
  // — одиннадцать расхождений закрыты интервью с владельцем 2026-09-05
  //   (протокол: eval/reports/scope-review-2026-09-05.md). Четыре из них
  //   вопросами не были: решения существовали, не хватало строк здесь.
  plugin: { hx: "HX5", note: "установка плагина из чужого репозитория — загрузчик выключен" },
  readPluginSource: { hx: "HX5", note: "чтение исходника плагина с диска; перенесённому плагину не нужно — он в бандле" },
  "plugin-profile-routes": { hx: "HX22", note: "маршруты профилей по нескольким ядрам — флот не бриджуем" },
  resolveFavicon: { hx: "HX21", note: "иконка сайта коннектора — показываем монограмму" },
  "secret-storage": { hx: "HX20", note: "их выключатель шифрования; мы шифруем всегда (C10)" },
  "context-menu": {
    ours: "context-menu",
    note: "правый клик: правка и картинка — перенесено 3E.10; меню рисует их рендерер, у нас только глаголы правки и copyImageAt",
  },
  "context-menu-spellcheck": {
    ours: "context-menu-spellcheck",
    note: "орфография: замена слова, свой словарь, факты от Chromium — перенесено 3E.10",
  },
  preview: {
    ours: "preview",
    note: "туннель к localhost удалённого ядра — 3E.5; отдельная сессия `ssh -N -L` по уже открытому подключению (ControlMaster в OpenSSH под Windows нет)",
  },
  // — приехало с пином 0.21.2 (задача 3.B4, решения владельца 2026-09-14 по
  //   таблице PLAN §«Решения интервью 2026-09-14»)
  capturePreview: {
    ours: "preview",
    note: "preview:capture — снимок гостя для их аннотаций на предпросмотре (пакет 9.7, берём)",
  },
  machine: {
    hx: "HX26",
    note: "факты о машине для их онбординг-чата; вторая роль — подсказка языка ОС при незаданном display.language — у нас недостижима: язык интерфейса задан всегда (shared/i18n/config-client.ts)",
  },
  app: { hx: "HX4", note: "hermes:app:relaunch — перезапуск после подмены бандла их обновлятором; обновлятор не берём, у нас — уведомление (T42)" },
  "pool-limits": {
    hx: "HX27",
    note: "пределы пула бэкендов: пула у нас нет (один hermes serve на все профили) — ряд снят правкой [3], решение владельца 2026-09-15, замечание D-84",
  },
  // — пин 0.21.5 (задача 3.B6): сигнал их главного процесса «пул снимает бэкенд»
  //   (`hermes:pool:retiring`) — та же причина, что у `pool-limits` выше.
  pool: { hx: "HX27", note: "уведомление о снятии бэкенда пулом: пула у нас нет (один hermes serve на все профили)" },
  "preview-nav": {
    ours: "preview-nav",
    note: "жесты «назад/вперёд/обновить», не доходящие до окна сами (app-command, свайп) — 3E.5",
  },
  "browser-popout": {
    ours: "browser-popout",
    note: "вынос вкладки браузера в своё окно и возврат при закрытии — 3E.5",
  },
  "notification-activate": { ours: "notification-activate", note: "клик по уведомлению бота открывает его чат — задача 3D.9" },
  "mcp-oauth": {
    ours: "gateway",
    note: "OAuth к удалённому MCP-серверу идёт по REST через gateway:rest; редирект ловит САМО ядро (GET /api/mcp/oauth/callback/{server}) — замерено 01.09.2026",
  },  // — пин 0.22.2 (предрелизная сверка T37, 2026-10-19): решения записаны в SPEC и в
  //   контракте `runtime/contracts/donor-move-0.22.2.md` §4, решения владельца 2026-10-19.
  "desktop-metrics": { hx: "HX31", note: "телеметрия для Nous" },
  "startup-latency": { hx: "HX31", note: "замер старта для той же телеметрии" },
  freeTierChallenge: { hx: "HX3", note: "вход в бесплатный тариф их облака" },
  "update-hold": { hx: "HX4", note: "их обновлятор; у нас — уведомление о версии (T42)" },
  "hud-modifier": { hx: "HX29", note: "жест Ctrl+Alt для плавающей панели — не берётся (дополнение 2026-09-28)" },
  screenshot: { hx: "HX29", note: "снимок окна жестом двух Command — только macOS" },
  "window-control": { hx: "HX29", note: "кнопки окна под WSLg — только Linux" },
  "f12-shortcut": { ours: "f12-shortcut", note: "F12 как назначаемая клавиша — 3G.23" },
  f12ShortcutActive: { ours: "f12-shortcut", note: "F12 как назначаемая клавиша — 3G.23" },
  "minimize-to-tray": { ours: "minimize-to-tray", note: "сворачивание в трей — 3G.23" },
  "embed-host": { hx: "HX32", note: "YouTube внутри чата через локальный http — не берём" },
  "local-backend": { ours: "connection", note: "«эта машина / удалённый шлюз» — наш экран подключения (T35)" },
  "keep-awake-offer": { ours: "keep-awake", note: "keep-awake:offer — предложение не спать после сна посреди хода, один раз на компьютер (T42.1)" },
  "external-open-failed": { ours: "external-open", note: "external-open:failed — их диалог с адресом вместо мёртвого клика (T42.2)" },
  "preview-guest-hidden": { ours: "preview-guest", note: "preview-guest:hidden — скрытая вкладка браузера не листается жестами (T42.3)" },
};

/** RPC prefixes §Non-Goals excludes, for the reachability note. Each cites the
 * entry that named it, so the note cannot outlive its reason. */
export const EXCLUDED_RPC = [
  { prefix: "pet.", hx: "HX1" },
  { prefix: "billing.", hx: "HX2" },
  { prefix: "credits.", hx: "HX2" },
  // `image.generate` СНЯТ 2026-09-07 (задача 3E.1): HX11 сужен решением
  // владельца 05.09, генерация картинок вошла в объём (UR33), и метод
  // перестал быть «достижимым вопреки исключению» — он просто разрешён.
  // `window.read.` СНЯТ там же: HX12 отменён 05.09 (UR30, перечисление окон
  // агенту); поверхность даёт задача 3E.8.
];

/** §Non-Goals entries, read from SPEC so the table cannot cite one that was
 * renamed or removed. */
export function readExclusions(specText) {
  return [...specText.matchAll(/^- \*\*(HX\d+)\./gm)].map((m) => m[1]);
}

/** Rows of the TASKS task tables — `| T12 | задача | done | After | Verification |`,
 * the canonical format since the toolkit update of 2026-10-15. Only a row whose
 * first cell is a task id counts: the §ID changes table maps legacy numbers
 * (`5.1а`, `3.B3д`, `D-84`) and is lookup history, not work a verdict may cite.
 * Cells split on unescaped pipes, as the toolkit checker splits them — a task
 * text may carry a literal `\|`. */
function taskRows(tasksText) {
  const rows = [];
  for (const line of tasksText.split(/\r?\n/)) {
    if (!/^\| T\d+(?:\.\d+)? \|/.test(line)) continue;
    const cells = line
      .split(/(?<!\\)\|/)
      .slice(1, -1)
      .map((cell) => cell.trim());
    rows.push({ id: cells[0], status: cells[2] });
  }
  return rows;
}

/** Task ids TASKS.md actually carries, so the table cannot cite a task that was
 * renumbered out from under it. */
export function readTaskIds(tasksText) {
  return new Set(taskRows(tasksText).map((row) => row.id));
}

/** Task ids already finished (`done` or `cancelled`). A verdict citing a CLOSED
 * task is as stale as one citing a task that never existed: it answers «работа
 * впереди» for work that is behind. */
export function readClosedTaskIds(tasksText) {
  return new Set(
    taskRows(tasksText)
      .filter((row) => row.status === "done" || row.status === "cancelled")
      .map((row) => row.id)
  );
}

/** Methods the renderer may never name, from the deny list itself rather than a
 * copy of it. */
export function readDenied(denyText) {
  const block = /DENIED_RPC_METHODS[^=]*=\s*\[([^\]]*)\]/s.exec(denyText);
  return block ? [...block[1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]) : [];
}

/** Capability groups of an IPC surface: the first segment of every channel a
 * preload publishes. `prefix` strips their `hermes:` namespace so the two sides
 * are named on the same terms. */
export function readChannelGroups(preloadText, prefix = "") {
  const groups = new Set();
  for (const match of preloadText.matchAll(/(?:invoke|send|on)\(\s*'([a-zA-Z0-9:_.-]+)'/g)) {
    const channel = match[1];
    if (prefix) {
      if (!channel.startsWith(prefix)) continue;
      groups.add(channel.slice(prefix.length).split(":")[0]);
    } else {
      groups.add(channel.split(":")[0]);
    }
  }
  return [...groups].sort();
}

/** Classifies one of their capability groups against ours. Unlike a surface,
 * "ours" is a claim the table makes and the caller has already verified — an
 * unverified claim must never read as coverage. */
export function classifyChannel(name, { rule, ourGroups, ourFiles }) {
  const base = { kind: "канал", id: name };
  if (rule?.ours) {
    return ourGroups.has(rule.ours)
      ? { ...base, status: "ours", via: rule.ours, note: rule.note }
      : { ...base, status: "gap", brokenClaim: rule.ours };
  }
  if (rule?.ourWay) {
    return ourFiles?.has(rule.ourWay)
      ? { ...base, status: "ours", via: rule.ourWay, note: rule.note }
      : { ...base, status: "gap", brokenClaim: rule.ourWay };
  }
  if (rule?.hx) return { ...base, status: "excluded", ...rule };
  if (rule?.task) return { ...base, status: "planned", ...rule };
  // Строка БЕЗ вердикта, но С пояснением — это разрыв, который уже смотрели
  // глазами (замечание D-71): «мы измерили, чего нет» читается иначе, чем «сюда
  // никто не заглядывал», а решение владельцу нужно принимать по первому.
  return { ...base, status: "gap", note: rule?.note };
}

/** A surface counts as ours when its ENTRY POINT is vendored, not when some
 * file under it is. Our zone carries `app/cron/job-state.ts` and no screen —
 * one helper pulled in as somebody else's dependency. Counting files would
 * report the cron surface as present at 1/9 and let a real разрыв pass. */
export function classifySurface(name, { theirs, ours, entry, rule, ourFiles }) {
  const base = { kind: "поверхность", id: name, theirs, ours, entry };
  if (entry) return { ...base, status: "ours" };
  if (rule?.ourWay) {
    return ourFiles?.has(rule.ourWay)
      ? { ...base, status: "ours", via: rule.ourWay, note: rule.note }
      : { ...base, status: "gap", brokenClaim: rule.ourWay };
  }
  if (rule?.hx) return { ...base, status: "excluded", ...rule };
  if (rule?.task) return { ...base, status: "planned", ...rule };
  return { ...base, status: "gap" };
}

/**
 * Builds the registry. Pure: takes the inventories, returns what is printed.
 */
/** Пути `ourWay` из обеих таблиц, которые ДЕЙСТВИТЕЛЬНО есть на диске. */
export function existingOurWayFiles() {
  const cited = [...Object.values(CLASSIFICATION), ...Object.values(ELECTRON_CLASSIFICATION)]
    .map((rule) => rule.ourWay)
    .filter(Boolean);

  return new Set(cited.filter((relative) => fs.existsSync(path.join(REPO_DIR, relative))));
}

export function buildRegistry({ surfaces, channels, exclusions, taskIds, closedTaskIds, ourFiles, denied, from }) {
  const ourGroups = new Set(channels?.ours ?? []);
  const files = new Set(ourFiles ?? []);
  const closed = new Set(closedTaskIds ?? []);
  const rows = [
    ...Object.entries(surfaces).map(([name, counts]) =>
      classifySurface(name, { ...counts, rule: CLASSIFICATION[name], ourFiles: files }),
    ),
    ...(channels?.theirs ?? []).map((name) =>
      classifyChannel(name, { rule: ELECTRON_CLASSIFICATION[name], ourGroups, ourFiles: files }),
    ),
  ];

  const problems = [];
  const usedHx = new Set(rows.map((r) => r.hx).filter(Boolean));
  const usedTasks = new Set(rows.map((r) => r.task).filter(Boolean));

  for (const hx of usedHx) {
    if (!exclusions.includes(hx)) problems.push(`таблица ссылается на ${hx}, которого нет в SPECIFICATION`);
  }
  for (const task of usedTasks) {
    if (!taskIds.has(task)) problems.push(`таблица ссылается на задачу ${task}, которой нет в TASKS`);
    // Замечание D-71. Вердикт «задача принесёт» про ЗАКРЫТУЮ задачу отвечает
    // «работа впереди» о работе, которая позади, — и таких строк набралось 46,
    // потому что проверка была написана (`readClosedTaskIds`) и не подключена.
    else if (closed.has(task)) {
      problems.push(`строка ссылается на ЗАКРЫТУЮ задачу ${task} — вердикт «запланировано» устарел`);
    }
  }
  // A dead entry is not harmless: it means a surface was ported (or renamed) and
  // the reason recorded for NOT having it is now a lie sitting in the table.
  for (const name of Object.keys(CLASSIFICATION)) {
    if (!(name in surfaces)) problems.push(`в таблице есть «${name}», которой нет у донора на этом ref`);
    else if (surfaces[name].entry) problems.push(`«${name}» перенесена, но в таблице числится причина её отсутствия`);
  }

  const theirChannels = new Set(channels?.theirs ?? []);
  for (const [name, rule] of Object.entries(ELECTRON_CLASSIFICATION)) {
    if (!theirChannels.has(name)) {
      problems.push(`в таблице каналов есть «${name}», которого нет у донора на этом ref`);
    } else if (rule.ours && !ourGroups.has(rule.ours)) {
      // The claim "мы это покрываем каналом X" is the one line in the table that
      // can rot silently: our preload is ours to rename.
      problems.push(`таблица каналов обещает наш канал «${rule.ours}» для «${name}», а в preload его нет`);
    } else if (rule.ourWay && !files.has(rule.ourWay)) {
      problems.push(`таблица каналов ссылается на файл «${rule.ourWay}» для «${name}», а его нет`);
    }
  }

  for (const [name, rule] of Object.entries(CLASSIFICATION)) {
    if (rule.ourWay && !files.has(rule.ourWay)) {
      problems.push(`таблица поверхностей ссылается на файл «${rule.ourWay}» для «${name}», а его нет`);
    }
  }

  const reachable = EXCLUDED_RPC.filter((e) => !denied.some((d) => d.startsWith(e.prefix)));
  const by = (status) => rows.filter((r) => r.status === status).sort((a, b) => a.id.localeCompare(b.id));

  return {
    from,
    ours: by("ours"),
    excluded: by("excluded"),
    planned: by("planned"),
    gaps: by("gap"),
    unexpressed: exclusions.filter((hx) => !usedHx.has(hx)),
    reachableExcluded: reachable,
    denied,
    problems,
  };
}

export function formatRegistry(registry) {
  const lines = [];
  lines.push(`реестр паритета против ${registry.from.ref}`);
  lines.push(`  ${registry.from.sha}`);
  lines.push("  единица — их экран (app/<имя>); «перенесено» считается по точке входа");

  if (registry.problems.length > 0) {
    lines.push("", `== ТАБЛИЦА УСТАРЕЛА (${registry.problems.length})`);
    for (const p of registry.problems) lines.push(`  ${p}`);
  }

  const label = (r) => `${r.kind === "канал" ? "канал " : "экран "}${r.id}`.padEnd(30);

  lines.push("", `== есть у нас (${registry.ours.length})`);
  for (const r of registry.ours) {
    const how = r.kind === "канал" ? `наш канал ${r.via}:*` : `файлов ${r.ours}/${r.theirs}`;
    lines.push(`  ${label(r)} ${how}${r.note ? ` — ${r.note}` : ""}`);
  }

  lines.push("", `== исключено (${registry.excluded.length})`);
  for (const r of registry.excluded) {
    lines.push(`  ${label(r)} ${r.hx}${r.note ? ` — ${r.note}` : ""}`);
  }

  lines.push("", `== запланировано (${registry.planned.length})`);
  for (const r of registry.planned) {
    lines.push(`  ${label(r)} задача ${r.task}${r.note ? ` — ${r.note}` : ""}`);
  }

  lines.push("", `== РАСХОЖДЕНИЕ (${registry.gaps.length})`);
  if (registry.gaps.length === 0) {
    lines.push("  пусто — AC9 выполнен: у каждой их возможности есть перенос, исключение или задача");
  }
  for (const r of registry.gaps) {
    const why = r.brokenClaim
      ? `таблица обещала наш канал ${r.brokenClaim}, его нет`
      : r.kind === "канал"
        ? "их возможность main-процесса без записанного соответствия"
        : `их файлов: ${r.theirs}`;
    const what = r.note ? `${r.note}; ` : "";
    lines.push(`  ${label(r)} ${what}${why} — НУЖНО решение: перенос, §Non-Goals или задача`);
  }

  if (registry.unexpressed.length > 0) {
    lines.push(
      "",
      `== исключения, не выражаемые экраном (${registry.unexpressed.length})`,
      `  ${registry.unexpressed.join(", ")}`,
      "  не дефект: исключение может касаться зависимости, настройки или чужого",
      "  фронтенда. Сверяется глазами.",
    );
  }

  lines.push("", "== достижимость исключённого через обобщённый проброс");
  lines.push(`  запрещено в main: ${registry.denied.join(", ") || "ничего"}`);
  if (registry.reachableExcluded.length > 0) {
    lines.push(
      `  достижимы, хотя исключены продуктом: ${registry.reachableExcluded.map((e) => `${e.prefix}* (${e.hx})`).join(", ")}`,
      "  это НЕ разрыв паритета: исключение — решение о продукте, запрет — о безопасности.",
      "  Строка существует, чтобы никто не считал, будто §Non-Goals что-то запрещает технически.",
    );
  }

  return lines.join("\n");
}

// ------------------------------------------------------------------ inventories

function git(args) {
  return execFileSync("git", ["-C", DONOR_ROOT, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Their screens at `ref` with file counts, and what our zone carries of each.
 * `entry` is the screen's own entry point — the file that makes it a surface
 * rather than a folder of helpers. */
function donorSurfaces(ref, vendored) {
  const theirs = new Map();
  const entryPoints = new Map();
  for (const file of git(["ls-tree", "-r", "--name-only", ref, "apps/desktop/src/app"]).split(/\r?\n/)) {
    const rel = file.replace(/^apps\/desktop\/src\/app\//, "");
    if (rel === file || !rel.includes("/")) continue; // loose files under app/ are not a surface
    const [name, ...rest] = rel.split("/");
    if (rest.join("/").startsWith("index.")) entryPoints.set(name, rel);
    if (/\.test\.[tj]sx?$/.test(rel)) continue; // their tests are not surface area
    theirs.set(name, (theirs.get(name) ?? 0) + 1);
  }

  const ours = new Map();
  const oursEntry = new Set();
  for (const entry of vendored) {
    const match = /^apps\/desktop\/src\/app\/([^/]+)\/(.+)$/.exec(entry.source);
    if (!match) continue;
    const [, name, rest] = match;
    ours.set(name, (ours.get(name) ?? 0) + 1);
    if (rest.startsWith("index.")) oursEntry.add(name);
  }

  const out = {};
  for (const [name, count] of [...theirs].sort()) {
    out[name] = {
      theirs: count,
      ours: ours.get(name) ?? 0,
      // A surface upstream declares without an index file (a folder of parts
      // mounted from elsewhere) cannot be judged by its entry point; carrying
      // any of it is the best signal available, and the count says how much.
      entry: entryPoints.has(name) ? oursEntry.has(name) : (ours.get(name) ?? 0) > 0,
    };
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf("--json");
  const jsonPath = jsonAt === -1 ? null : argv[jsonAt + 1];
  const jsonValueAt = jsonAt === -1 ? -1 : jsonAt + 1;
  const refs = argv.filter((a, i) => !a.startsWith("--") && i !== jsonValueAt);
  const ref = refs[0] ?? DONOR_SHA;

  let sha;
  try {
    sha = git(["rev-parse", `${ref}^{commit}`]).trim();
  } catch {
    console.error(`ref не найден в ${DONOR_ROOT}: ${ref}`);
    process.exit(1);
  }

  const registry = buildRegistry({
    surfaces: donorSurfaces(sha, readVendorZone()),
    channels: {
      theirs: readChannelGroups(git(["show", `${sha}:apps/desktop/electron/preload.ts`]), "hermes:"),
      ours: readChannelGroups(fs.readFileSync(OUR_PRELOAD, "utf8")),
    },
    exclusions: readExclusions(fs.readFileSync(SPEC_FILE, "utf8")),
    taskIds: readTaskIds(fs.readFileSync(TASKS_FILE, "utf8")),
    closedTaskIds: readClosedTaskIds(fs.readFileSync(TASKS_FILE, "utf8")),
    // Файлы, на которые ссылаются записи `ourWay`, — проверенные существующими.
    // Так же, как `ours` проверяется по preload: обещание в таблице должно быть
    // опровержимым, иначе оно не обещание, а надпись.
    ourFiles: existingOurWayFiles(),
    denied: readDenied(fs.readFileSync(DENY_FILE, "utf8")),
    from: { ref, sha },
  });

  console.log(formatRegistry(registry));
  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(registry, null, 2));
    console.log(`\nмашиночитаемый отчёт: ${jsonPath}`);
  }
  // A разрыв or a stale table is a finding, not a crash: the report is still
  // worth reading, and the exit code is what a gate would check.
  //
  // `--gate` narrows that to the half a gate can honestly enforce (finding
  // D-50). A РАСХОЖДЕНИЕ is a question for the owner — «перенос, §Non-Goals или
  // задача» — and a build that stops until someone answers it buys nothing: the
  // answer arrives in an interview, not in a commit. A stale table is different.
  // It is objectively wrong: the screen is right there in our tree while the
  // table still explains its absence, and nobody has to decide anything to fix
  // it. Only that half fails under `--gate`; the разрыв list still prints.
  const gateOnly = argv.includes("--gate");
  const failing = gateOnly
    ? registry.problems.length > 0
    : registry.gaps.length > 0 || registry.problems.length > 0;
  process.exitCode = failing ? 1 : 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
