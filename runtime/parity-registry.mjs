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
 * entry that excludes it; `task` cites the TASKS id that will bring it.
 *
 * Hand-written on purpose. Matching SPEC prose against directory names would
 * produce a mapping nobody can audit, and the whole value of AC9 is that a
 * reader can check every line against the document. The integrity checks below
 * refuse to let the table go stale: a cited HX that SPEC lost, a cited task
 * TASKS lost, and an entry no row used are all reported. */
export const CLASSIFICATION = {
  "pet-generate": { hx: "HX1", note: "питомец и генерация его изображения" },
  "pet-overlay": { hx: "HX1", note: "питомец" },
  agents: { task: "7.1", note: "доска агентов — N10, отнесена в Phase 7" },
  "quick-entry": { task: "3.15", note: "быстрый ввод по глобальному хоткею" },
  "wake-indicator": { task: "3.7b", note: "индикатор слова-активатора" },
  webhooks: { task: "3.11", note: "исходящие вебхуки, UR19" },
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
  watchDirectory: { ours: "scan", note: "детект изменений источников, UR7" },
  setting: { ours: "settings" },
  "data-url-read-max": { ours: "settings", note: "лимит на встраиваемый файл" },
  // — исключено §Non-Goals
  cloud: { hx: "HX3", note: "вход в их облако" },
  "pet-overlay": { hx: "HX1" },
  git: { hx: "HX6", note: "голый git-UI; diff-вьюер приходит отдельно, задача 3.3" },
  terminal: { task: "3E.8", note: "живая оболочка — HX7 отменён 2026-09-05, UR30" },
  // — запланировано
  hud: { task: "3.24" },
  "quick-entry": { task: "3.15" },
  "keep-awake": { task: "3.18" },
  "wake-indicator": { task: "3.7b" },
  updates: { task: "3.21" },
  "open-updates": { task: "3.21" },
  connections: { task: "3.12" },
  connection: { task: "3.12" },
  "connection-config": { task: "3.12" },
  "ssh-config": { task: "3.12" },
  "get-remote-display-reason": { task: "3.13a", note: "честное отключение поверхности в удалённом режиме" },
  "find-in-page": { task: "3.16" },
  "open-find-bar": { task: "3.16" },
  "stop-find-in-page": { task: "3.16" },
  "found-in-page": { task: "3.16" },
  "deep-link": { task: "3.8", note: "установка MCP по внешней ссылке" },
  "deep-link-ready": { task: "3.8" },
  agents: { task: "7.1" },
  "close-preview-requested": { task: "3.4" },
  "preview-file-changed": { task: "3.4" },
  watchPreviewFile: { task: "3.4" },
  stopPreviewFileWatch: { task: "3.4" },
  normalizePreviewTarget: { task: "3.4" },
  openPreviewInBrowser: { task: "3.4" },
  previewShortcutActive: { task: "3.4" },
  requestMicrophoneAccess: { ours: "media", note: "3.7a: media:request-microphone, UR21" },
  fetchLinkTitle: { task: "3.17", note: "вставленная ссылка становится элементом" },
  window: { task: "3.14" },
  // — решения владельца 2026-08-16 (интервью по разрыву, найденному этим реестром)
  zoom: { task: "3.26", note: "зум — доступность, взят" },
  "native-theme": { task: "3.26" },
  translucency: { hx: "HX14", note: "прозрачность окна" },
  "titlebar-theme": { hx: "HX14" },
  "vscode-theme": { hx: "HX14", note: "импорт чужого конфига с диска" },
  selectSavePath: { task: "3.27" },
  saveImageBuffer: { task: "3.27" },
  saveImageFromUrl: { task: "3.27" },
  saveGatewayFile: { task: "3.27" },
  notify: { task: "3.28" },
  "notification-action": { task: "3.28" },
  "power-battery": { task: "3.28" },
  "power-resume": { task: "3.28" },
  logs: { task: "3.29", note: "падение рендерера должно пережить окно" },
  uninstall: { task: "6.11" },
  "active-work": { task: "3E.11" },
  ambient: { task: "3E.11", note: "фоновые подсказки" },
  devtools: { task: "3E.11", note: "запрет F12" },
  version: { task: "3E.11" },
  "window-state-changed": { task: "3.14" },
  "focus-session": { task: "3.14" },
  "open-folder-requested": { task: "3.14" },
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
  preview: { task: "3E.5", note: "туннель к localhost удалённого ядра" },
  "preview-nav": { task: "3E.5", note: "навигация внутри страницы" },
  "browser-popout": { task: "3E.5", note: "вынос вкладки браузера в своё окно" },
  "notification-activate": { task: "3D.9", note: "клик по уведомлению бота открывает его чат" },
  "mcp-oauth": {
    ours: "gateway",
    note: "OAuth к удалённому MCP-серверу идёт по REST через gateway:rest; редирект ловит САМО ядро (GET /api/mcp/oauth/callback/{server}) — замерено 01.09.2026",
  },
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

/** Task ids TASKS.md actually carries, so the table cannot cite a task that was
 * renumbered out from under it. */
export function readTaskIds(tasksText) {
  return new Set([...tasksText.matchAll(/^- \[[ x]\] ((?:\d+\.)?[\dA-Za-z.]+) /gm)].map((m) => m[1]));
}

/** Task ids already ticked off. A verdict citing a CLOSED task is as stale as
 * one citing a task that never existed: it answers «работа впереди» for work
 * that is behind. */
export function readClosedTaskIds(tasksText) {
  return new Set([...tasksText.matchAll(/^- \[x\] ((?:\d+\.)?[\dA-Za-z.]+) /gm)].map((m) => m[1]));
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
export function classifyChannel(name, { rule, ourGroups }) {
  const base = { kind: "канал", id: name };
  if (rule?.ours) {
    return ourGroups.has(rule.ours)
      ? { ...base, status: "ours", via: rule.ours, note: rule.note }
      : { ...base, status: "gap", brokenClaim: rule.ours };
  }
  if (rule?.hx) return { ...base, status: "excluded", ...rule };
  if (rule?.task) return { ...base, status: "planned", ...rule };
  return { ...base, status: "gap" };
}

/** A surface counts as ours when its ENTRY POINT is vendored, not when some
 * file under it is. Our zone carries `app/cron/job-state.ts` and no screen —
 * one helper pulled in as somebody else's dependency. Counting files would
 * report the cron surface as present at 1/9 and let a real разрыв pass. */
export function classifySurface(name, { theirs, ours, entry, rule }) {
  const base = { kind: "поверхность", id: name, theirs, ours, entry };
  if (entry) return { ...base, status: "ours" };
  if (rule?.hx) return { ...base, status: "excluded", ...rule };
  if (rule?.task) return { ...base, status: "planned", ...rule };
  return { ...base, status: "gap" };
}

/**
 * Builds the registry. Pure: takes the inventories, returns what is printed.
 */
export function buildRegistry({ surfaces, channels, exclusions, taskIds, denied, from }) {
  const ourGroups = new Set(channels?.ours ?? []);
  const rows = [
    ...Object.entries(surfaces).map(([name, counts]) =>
      classifySurface(name, { ...counts, rule: CLASSIFICATION[name] }),
    ),
    ...(channels?.theirs ?? []).map((name) =>
      classifyChannel(name, { rule: ELECTRON_CLASSIFICATION[name], ourGroups }),
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
    lines.push(`  ${label(r)} ${why} — НУЖНО решение: перенос, §Non-Goals или задача`);
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
