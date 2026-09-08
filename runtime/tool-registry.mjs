// The THIRD parity axis: the core's AGENT TOOLS, sorted into «есть у нас» /
// «исключено» / «задача» / «РАСХОЖДЕНИЕ» (task 3E.0).
//
// WHY THIS EXISTS. Web search fell out of the product without a decision ever
// being taken about it, and the reason was not carelessness: this axis did not
// exist. `parity-registry.mjs` measures their SCREENS and our main-process
// CHANNELS, and its own header says the RPC surface is not a parity axis. A
// tool the model can call is neither a screen nor a channel, so nothing ever
// counted them. Until this file, «взяли по максимуму» could not be checked.
//
// THE UNIT IS A TOOL, NOT A PYTHON MODULE. `tools/` holds 138 files and ten of
// them are `browser_*`; counting files would report a surface three times its
// real size — the same error `classifySurface` corrects on the screens axis.
// The unit here is the NAME THE MODEL SEES: one entry per tool schema.
//
// THE LIST IS ASKED OF THE CORE, NOT COPIED. `TOOLSETS` is read by running the
// core's own Python, so a pin bump that adds a tool shows up as a РАСХОЖДЕНИЕ
// instead of quietly agreeing with a list we transcribed once.
//
// PLATFORM BUNDLES ARE NOT CAPABILITIES. `hermes-telegram`, `hermes-slack` and
// their sixteen siblings are «which tools a Telegram bot gets» — bundles of the
// same tools. The script PROVES they add nothing new (asserts the union) rather
// than assuming it, and drops them from the count.
//
//   node runtime/tool-registry.mjs             — таблица и разделы
//   node runtime/tool-registry.mjs --json out.json
//
// Exit code is 1 while РАСХОЖДЕНИЕ is non-empty — same contract as the screens
// registry. A divergence leaves that section by a decision of the owner, never
// by being forgotten: the phase rule says new ones are put to the owner, not
// closed by the task that found them.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { HERMES_SRC_DIR, PYTHON_BIN, HERMES_VERSION, HERMES_SHA } from "./hermes-env.mjs";
import { readClosedTaskIds, readExclusions, readTaskIds } from "./parity-registry.mjs";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(RUNTIME_DIR, "..");
const SPEC_FILE = path.join(REPO_DIR, "SPECIFICATION.md");
const TASKS_FILE = path.join(REPO_DIR, "TASKS.md");

/** Their platform bundles: one per messaging platform, each a union of the same
 * tools. Named by prefix because that is how the core names them. */
const PLATFORM_PREFIX = "hermes-";

/**
 * The verdict table. Every tool the core ships must match exactly one entry —
 * by name, or by the prefix of its family. `where` is the evidence: a file that
 * exists, a §Non-Goals number, or a task id. Both of the latter are CHECKED
 * against SPECIFICATION.md and TASKS.md, so a renumbering cannot leave a
 * citation pointing at nothing.
 */
export const VERDICTS = {
  // ── есть у нас ──────────────────────────────────────────────────────────
  read_file: { status: "ours", where: "инструмент ядра, клиентской части не требует; область ограничена R7 и mcp/aec_sources" },
  write_file: { status: "ours", where: "инструмент ядра, клиентской части не требует; область ограничена R7" },
  patch: { status: "ours", where: "инструмент ядра, клиентской части не требует" },
  search_files: { status: "ours", where: "инструмент ядра, клиентской части не требует" },
  skills_list: { status: "ours", where: "UR5/UR23, наша поверхность скилов — aec/project-skills/**" },
  skill_view: { status: "ours", where: "UR5/UR23, aec/project-skills/**" },
  skill_manage: { status: "ours", where: "UR5/UR23, aec/project-skills/**" },
  cronjob: { status: "ours", where: "UR18, наш тик — aec/cron-runner/**, поверхность их плагина — cron.tsx" },
  session_search: { status: "ours", where: "инструмент ядра поверх сессий, которые у нас уже есть" },
  clarify: { status: "ours", where: "donor/app/session/hooks/use-message-stream/gateway-event/input-requests.ts" },
  todo: { status: "ours", where: "инструмент ядра, клиента не требует; в §Non-Goals не значится → взят по UR13" },
  tip: { status: "ours", where: "взят решением владельца 2026-09-01 (SPEC HX16, граница); ветка tip.show в donor/.../desktop-bridge.ts" },
  focus_pane: { status: "ours", where: "ветка pane.reveal в donor/.../desktop-bridge.ts" },
  react_to_message: { status: "ours", where: "ветка message.reaction в donor/.../desktop-bridge.ts" },
  setup_mcp: { status: "ours", where: "ветка mcp.setup.request в donor/.../input-requests.ts" },
  desktop_preview: { status: "ours", where: "ветка preview.read.request в donor/.../desktop-bridge.ts; сама область предпросмотра — задача 3.4" },

  // ── задачи (решение принято, работа впереди) ────────────────────────────
  web_search: { status: "ours", where: "UR32 — задача 3E.2, провайдер `ddgs` записан нами (main/index.ts::applyWebBackend), живой прогон — runtime/web-search-probe.mjs" },
  // Чтение страницы: провайдера НЕ назначаем — механизм донора целиком
  // (решение владельца 2026-09-08). Наша работа была в другом: дверь к
  // выбору достижима из окна, и пустой выбор ведёт себя честно.
  web_extract: {
    status: "ours",
    where:
      "UR32 — задача 3E.18: провайдера выбирает человек в их же панели наборов (donor/app/settings/toolset-config-panel.tsx, экран «Навыки», вкладка Tools); дверь проверена e2e, живой отказ без выбора — runtime/web-search-probe.mjs; недоверенный текст — 3E.4 (R22)",
  },
  vision_analyze: {
    status: "ours",
    where: "UR33 — зрение; ВКЛЮЧЁН по умолчанию, замерено 3E.6 на свежем профиле (набор `vision`)",
  },
  // Набор `video` у ядра в `_DEFAULT_OFF_TOOLSETS`, то есть выключен по
  // умолчанию и выживает только будучи назван ЯВНО — и именно в
  // `platform_toolsets`, а не в `toolsets` (задача 3E.19, `applyVideoToolset`).
  // Замерено инструментами МОДЕЛИ, а не наборами: 53 предложенных → 54,
  // `video_analyze` добавился, ни один не пропал (то есть D-66 не повторился).
  video_analyze: {
    status: "ours",
    where: "UR33 — понимание видео, решение владельца 2026-09-08; включён нами (main/index.ts::applyVideoToolset), замер 3E.19: 53 инструмента → 54",
  },
  image_generate: {
    status: "ours",
    where: "UR33 — генерация картинок; ВКЛЮЧЁН по умолчанию (набор `image_gen`), поверхность возвращает 3E.1",
  },
  execute_code: { status: "ours", where: "UR30 — задача 3E.8; проверено живым прогоном: посчитал и построил график (matplotlib/pandas в venv ядра); граница исполнения — 3E.7 (R21)" },
  computer_use: { status: "ours", where: "UR30 — набор включён, наша сторона ничего не закрывает; двоичный `cua-driver` ставит ЧЕЛОВЕК кнопкой их панели (её установщик просит повышения прав), задача 3E.8" },
  terminal: { status: "ours", where: "UR30 — инструмент ядра доступен модели, поверхность оболочки дана 3E.8 (node-pty), граница — 3E.7" },
  process: { status: "ours", where: "UR30 — см. terminal" },
  read_terminal: { status: "ours", where: "их же ветка `terminal.read.request` в зоне сериализует буфер xterm; недостающей половиной была ОБОЛОЧКА, её дала 3E.8" },
  close_terminal: { status: "ours", where: "см. read_terminal — та же ветка в зоне, та же недостающая половина" },
  read_window_below: { status: "ours", where: "UR30, HX12 отменён 05.09 — задача 3E.8: `main/os-windows.ts` через `get-windows`, только метаданные" },
  delegate_task: { status: "ours", where: "UR38 — задача 3E.13; проверено живым прогоном (`node runtime/delegate-probe.mjs`): агент делегировал, подагент прочитал файл и назвал строку 7, поток `subagent.*` пришёл в ленту" },
  // Вердикт переставлен с 5.0 на 5.1а задачей 3E.17: проверка «ссылка в никуда»
  // поймала, что 5.0 (переписать спеку памяти) закрыта, а строка по-прежнему
  // обещала работу впереди её номером. Живая работа теперь — установка Mem0 и
  // обязательные ключи провайдера.
  memory: { status: "task", task: "5.1а", where: "фаза 5 — память агента (Mem0), гейт пройден 2026-08-31, спека утверждена 2026-09-08" },
  tour: { status: "ours", where: "UR36 — задача 3E.12: ветка `tour.request` вернулась повторным переносом, driver.js 1.8.0; e2e ведёт экскурсию по ЧУЖОЙ странице в панели" },
  drive_preview: { status: "ours", where: "UR36 — задача 3E.12: `preview.act.request` вернулась там же; e2e доказан эхом самой страницы (агент напечатал и нажал)" },
  annotate_preview: { status: "ours", where: "UR36 — тот же канал `preview.act` (kind pin/unpin/hold), что и drive_preview; живьём в 3E.12 прогнаны elements/type/click, пометки — нет" },

  // ── исключено ──────────────────────────────────────────────────────────
  // Исключение стало ДЕЙСТВУЮЩИМ 2026-09-08 (замечание D-67): до этого запись
  // стояла здесь, а набор `tts` ядро всё равно отдавало десктопной сессии.
  // Выключатель — `agent.disabled_toolsets` (`applyDisabledToolsets`), замер
  // после правки: 21 набор вместо 22, `text_to_speech` в разрешении не
  // резолвится. Голосовая поверхность самого окна — отдельный вопрос D-72.
  text_to_speech: { status: "excluded", hx: "HX19", where: "голос сверх диктовки — решение владельца 2026-09-05; набор `tts` вычтен из профиля 2026-09-08" },
  // Исключение ДЕЙСТВУЮЩЕЕ, а не записанное: набор `project` шлюз добавляет
  // десктопной сессии сам (`_gui_surface_toolsets`), поэтому на уровне НАБОРОВ
  // он остаётся включённым — и первый замер этим обманулся. Решает вычитание на
  // уровне инструментов (`applyDisabledToolsets`), и проверено там же, где
  // видно ответ: в списке, предложенном модели, `desktop_project` отсутствует.
  desktop_project: { status: "excluded", hx: "HX23", where: "проект переключает человек, а не агент — граница источников R7; набор `project` вычтен из профиля 2026-09-08" },
  x_search: { status: "excluded", hx: "HX11", where: "поиск по X" },
  video_generate: { status: "excluded", hx: "HX11", where: "генерация видео" },
  xai_video_edit: { status: "excluded", hx: "HX11", where: "генерация видео (правка ролика)" },
  xai_video_extend: { status: "excluded", hx: "HX11", where: "генерация видео (продление ролика)" },
  discord: { status: "excluded", hx: "HX11", where: "Discord" },
  discord_admin: { status: "excluded", hx: "HX11", where: "Discord" },
  feishu_doc_read: { status: "excluded", hx: "HX11", where: "Feishu" },

  // ── семьи (префикс) ────────────────────────────────────────────────────
  // ДВА ВЗАИМОИСКЛЮЧАЮЩИХ РЕЖИМА, и это единственное место, где их видно рядом.
  // Решением владельца 2026-09-08 (задача 3E.17) выбран `browser_exec`: при
  // пустом `browser.backend` ядро включает режим Browser Use CLI и ПРЯЧЕТ
  // десять узких инструментов, оставляя один, принимающий произвольный код на
  // Python. Поэтому обе строки — «наше», но живой у продукта ровно один набор,
  // и какой именно, зависит от машины: где `uvx` есть — код, где нет —
  // прежние узкие (их же поведение «so browsing never silently breaks»).
  "browser_*": { status: "ours", where: "UR31/HX13 отменён; с 3E.17 это ЗАПАСНАЯ форма — работает там, где браузерный CLI не запускается; защита R22 — 3E.4" },
  // Живой прогон — `node runtime/browser-probe.mjs`: на машине разработки
  // модели предлагается ровно `browser_exec`, а десять узких скрыты. Цена
  // выбора записана в SPEC UR32 и R21: в ленте блок кода вместо действия (R19),
  // исполнение в отдельном демоне мимо границы 3E.7 (R21), пакет тянется с PyPI
  // в момент вызова.
  browser_exec: { status: "ours", where: "UR32 — решение владельца 2026-09-08 (3E.17); форма браузерной поверхности выбрана и записана, а не унаследована от того, что оказалось на диске" },
  // Их ядро прячет доску от обычного разговора НАМЕРЕННО: «Humans running
  // `hermes chat` without the kanban toolset see zero kanban tools»
  // (`tools/kanban_tools.py`). Дверь открывается записью `kanban` в
  // `toolsets` — её пишет `applyKanbanToolset` (задача 3E.13).
  "kanban_*": { status: "ours", where: "UR38 — задача 3E.13; проверено живым прогоном (`node runtime/kanban-probe.mjs`): ход агента вызвал `kanban_create`, задача появилась на доске по REST" },
  "spotify_*": { status: "excluded", hx: "HX11", where: "Spotify" },
  "ha_*": { status: "excluded", hx: "HX11", where: "Home Assistant" },
  "yb_*": { status: "excluded", hx: "HX11", where: "Yuanbao" },
  "feishu_drive_*": { status: "excluded", hx: "HX11", where: "Feishu" }
};

/** Asks the core for its own registry. Fails loudly: a silent empty answer here
 * would report a surface of zero tools and call it parity. */
export function readToolsets({ python = PYTHON_BIN, src = HERMES_SRC_DIR } = {}) {
  const code = "import json,toolsets;print(json.dumps({k:{'tools':v.get('tools',[]),'includes':v.get('includes',[])} for k,v in toolsets.TOOLSETS.items()}))";
  const answer = execFileSync(python, ["-c", code], { cwd: src, encoding: "utf-8" });
  const parsed = JSON.parse(answer);

  if (!parsed || Object.keys(parsed).length === 0) throw new Error("реестр инструментов ядра пуст");
  return parsed;
}

/** Capability toolsets and platform bundles, kept apart — and the proof that
 * the bundles carry nothing of their own. */
export function splitToolsets(toolsets) {
  const capability = {};
  const platform = {};

  for (const [name, body] of Object.entries(toolsets)) {
    (name.startsWith(PLATFORM_PREFIX) ? platform : capability)[name] = body;
  }

  const toolsOf = (group) =>
    new Set(Object.values(group).flatMap((body) => body.tools ?? []));

  const capabilityTools = toolsOf(capability);
  const onlyInPlatforms = [...toolsOf(platform)].filter((tool) => !capabilityTools.has(tool)).sort();

  return { capability, platform, tools: [...capabilityTools].sort(), onlyInPlatforms };
}

/** Which toolsets a tool belongs to — printed so a verdict can be read against
 * the group the core put the tool in. */
export function ownersOf(capability) {
  const owners = new Map();

  for (const [name, body] of Object.entries(capability)) {
    for (const tool of body.tools ?? []) {
      if (!owners.has(tool)) owners.set(tool, []);
      owners.get(tool).push(name);
    }
  }

  for (const list of owners.values()) list.sort();
  return owners;
}

/** The verdict for one tool: exact name first, then the family prefix. */
export function verdictFor(tool, verdicts = VERDICTS) {
  if (verdicts[tool]) return { key: tool, ...verdicts[tool] };

  for (const [key, verdict] of Object.entries(verdicts)) {
    if (key.endsWith("*") && tool.startsWith(key.slice(0, -1))) return { key, ...verdict };
  }
  return null;
}

export function buildRegistry({ toolsets, exclusions, taskIds, closedTaskIds = new Set(), verdicts = VERDICTS }) {
  const { capability, platform, tools, onlyInPlatforms } = splitToolsets(toolsets);
  const owners = ownersOf(capability);

  const rows = [];
  const divergent = [];
  const badCitations = [];

  for (const tool of tools) {
    const verdict = verdictFor(tool, verdicts);
    if (!verdict) {
      divergent.push({ tool, owners: owners.get(tool) ?? [] });
      continue;
    }

    if (verdict.status === "excluded" && !exclusions.includes(verdict.hx)) {
      badCitations.push(`${tool}: §Non-Goals не содержит ${verdict.hx} (отменён или переименован)`);
    }
    if (verdict.status === "task" && !taskIds.has(verdict.task)) {
      badCitations.push(`${tool}: в TASKS.md нет задачи ${verdict.task}`);
    } else if (verdict.status === "task" && closedTaskIds.has(verdict.task)) {
      badCitations.push(
        `${tool}: задача ${verdict.task} ЗАКРЫТА — вердикт «работа впереди» пережил работу; ` +
          `его место занимает «есть у нас» или «исключено»`
      );
    }

    rows.push({ tool, owners: owners.get(tool) ?? [], ...verdict });
  }

  // A verdict for a tool the core no longer ships is as wrong as a missing one:
  // it would keep answering for a surface that is gone.
  const stale = Object.keys(verdicts).filter((key) =>
    key.endsWith("*")
      ? !tools.some((tool) => tool.startsWith(key.slice(0, -1)))
      : !tools.includes(key)
  );

  return {
    version: HERMES_VERSION,
    sha: HERMES_SHA,
    toolsetCount: Object.keys(capability).length,
    platformCount: Object.keys(platform).length,
    toolCount: tools.length,
    onlyInPlatforms,
    rows,
    divergent,
    stale,
    badCitations
  };
}

export function formatRegistry(registry) {
  const out = [];
  const say = (line = "") => out.push(line);

  say(`== ИНСТРУМЕНТЫ ЯДРА ${registry.version} (${registry.sha.slice(0, 8)})`);
  say(
    `   ${registry.toolCount} инструментов в ${registry.toolsetCount} наборах возможностей; ` +
      `${registry.platformCount} платформенных наборов не считаются — это те же инструменты в связках`
  );
  if (registry.onlyInPlatforms.length > 0) {
    say(`   ВНИМАНИЕ: платформенные наборы принесли своё: ${registry.onlyInPlatforms.join(", ")}`);
  }
  say();

  const by = (status) => registry.rows.filter((row) => row.status === status);
  const line = (row) =>
    `  ${row.tool.padEnd(28)} ${(row.owners.join(",") || "-").padEnd(22)} ${
      row.status === "excluded" ? row.hx : row.status === "task" ? `задача ${row.task}` : "есть"
    } — ${row.where}`;

  for (const [title, status] of [
    ["есть у нас", "ours"],
    ["задача", "task"],
    ["исключено", "excluded"]
  ]) {
    const rows = by(status);
    say(`== ${title} (${rows.length})`);
    for (const row of rows) say(line(row));
    say();
  }

  say(`== РАСХОЖДЕНИЕ (${registry.divergent.length})`);
  if (registry.divergent.length === 0) {
    say("  пусто — у каждого инструмента ядра есть перенос, исключение или задача");
  } else {
    for (const row of registry.divergent) {
      say(`  ${row.tool.padEnd(28)} ${(row.owners.join(",") || "-").padEnd(22)} решения нет`);
    }
    say("  правило фазы: новое расхождение выносится ВЛАДЕЛЬЦУ, а не закрывается задачей,");
    say("  которая его нашла.");
  }
  say();

  if (registry.stale.length > 0) {
    say(`== ВЕРДИКТ БЕЗ ИНСТРУМЕНТА (${registry.stale.length})`);
    say("  ядро больше не отдаёт эти имена — вердикт отвечает за поверхность, которой нет:");
    for (const key of registry.stale) say(`  ${key}`);
    say();
  }

  if (registry.badCitations.length > 0) {
    say(`== ССЫЛКА В НИКУДА (${registry.badCitations.length})`);
    for (const problem of registry.badCitations) say(`  ${problem}`);
    say();
  }

  return out.join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const registry = buildRegistry({
    toolsets: readToolsets(),
    exclusions: readExclusions(fs.readFileSync(SPEC_FILE, "utf-8")),
    taskIds: readTaskIds(fs.readFileSync(TASKS_FILE, "utf-8")),
    closedTaskIds: readClosedTaskIds(fs.readFileSync(TASKS_FILE, "utf-8"))
  });

  console.log(formatRegistry(registry));

  const jsonAt = process.argv.indexOf("--json");
  if (jsonAt !== -1 && process.argv[jsonAt + 1]) {
    fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(registry, null, 2) + "\n", "utf-8");
  }

  process.exitCode =
    registry.divergent.length + registry.stale.length + registry.badCitations.length > 0 ? 1 : 0;
}
