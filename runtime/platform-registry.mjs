// The FOURTH parity axis: the core's PLATFORMS — the entrances through which
// messages reach the agent (task 3E.29).
//
// WHY THIS EXISTS. Three axes already measure the product: their SCREENS and
// our main-process CHANNELS (`parity-registry.mjs`), and the agent's TOOLS
// (`tool-registry.mjs`). None of them counts an entrance. A platform is not a
// screen, not a channel of ours and not a tool the model calls — so «взяли по
// максимуму» stood on words here, exactly as it did on the tools axis until
// 3E.0 measured it and found web search missing. Entrances are also the axis
// with a direct security requirement behind it (SPEC R10, AC10): each one
// carries project data out of the machine and lets somebody start the agent
// from outside.
//
// THE UNIT IS A CARD ON THE CHANNELS PAGE, NOT A PLUGIN FOLDER. Counting
// `plugins/platforms/` would report 22 where the live catalog holds 33: the
// built-in adapters live elsewhere, and two ids (`msgraph_webhook`, `relay`)
// exist only in the gateway enum. The unit here is what the person can see and
// switch on — the entry of the catalog their own Channels page reads.
//
// THE LIST IS ASKED OF THE CORE, NOT COPIED. `readPlatforms` runs the very
// function their REST route calls (`_messaging_platform_catalog`), so a pin
// bump that adds an entrance shows up as a РАСХОЖДЕНИЕ instead of quietly
// agreeing with a list transcribed once.
//
// TWO SIDES OF «есть у нас» ARE KEPT APART, because they are different
// promises. `shown` — the four cards our bridge publishes (owner decision O7,
// `aec/channels-disclosure/disclosure-pure.ts`), read from that module rather
// than copied. `ours` — in scope by a SPEC decision but not on the shortlist:
// visible only once the channel is actually enabled, by the same module's rule
// «включённый канал не прячется никогда».
//
//   node runtime/platform-registry.mjs             — таблица и разделы
//   node runtime/platform-registry.mjs --json out.json
//
// Exit code is 1 while РАСХОЖДЕНИЕ, ВЕРДИКТ БЕЗ ПЛАТФОРМЫ or ССЫЛКА В НИКУДА
// is non-empty — same contract as the other two registries. A row waiting on
// the owner is NOT a divergence: it carries the finding number it was put to
// him under, and that number is checked against TASKS.md like every other
// citation.

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
const SHORTLIST_FILE = path.join(
  REPO_DIR,
  "apps/desktop/src/renderer/src/aec/channels-disclosure/disclosure-pure.ts"
);

/**
 * The verdict table. Every entrance the core ships must match exactly one
 * entry. `where` is the evidence: a SPEC requirement, a §Non-Goals number, a
 * task id or a finding id — the last three are CHECKED against SPECIFICATION.md
 * and TASKS.md, so a renumbering cannot leave a citation pointing at nothing.
 *
 * `ours` reads «в объёме по UR19, но карточки в списке нет»: the shortlist is
 * ours to choose (O7), the scope is not. Мессенджер, не названный в HX11,
 * входит в объём по правилу «всё, чего нет в закрытом списке» — вердикт здесь
 * записывает это, а не решает заново.
 */
export const VERDICTS = {
  // ── показываем в окне (короткий список, решение владельца O7) ────────────
  telegram: { status: "shown", where: "UR19 — короткий список каналов, решение владельца O7 (2026-08-22)" },
  email: { status: "shown", where: "UR19 — короткий список каналов, решение владельца O7 (2026-08-22)" },
  webhook: {
    status: "shown",
    where:
      "UR19 — короткий список O7; вход ВХОДЯЩИЙ (GitHub, GitLab, JIRA — HMAC по маршруту), " +
      "то есть та половина R10, которой запускают агента снаружи",
  },
  a2a: {
    status: "shown",
    where: "UR19 называет A2A прямо; короткий список O7; подпись push — задача 3.11, дефект ядра",
  },

  // ── в объёме, карточки в списке нет (видна, когда канал включён) ─────────
  slack: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  mattermost: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  matrix: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  whatsapp: { status: "ours", where: "UR19 — мессенджер (личный аккаунт через мост)" },
  whatsapp_cloud: { status: "ours", where: "UR19 — мессенджер (WhatsApp Business Cloud API)" },
  signal: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  bluebubbles: { status: "ours", where: "UR19 — iMessage через мост BlueBubbles" },
  sms: { status: "ours", where: "UR19 — SMS через Twilio; ключи провайдера по C10" },
  dingtalk: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  google_chat: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  wecom: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  wecom_callback: { status: "ours", where: "UR19 — тот же WeCom, обратный вызов" },
  weixin: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  qqbot: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  irc: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  line: { status: "ours", where: "UR19 — мессенджер, в HX11 не назван" },
  ntfy: { status: "ours", where: "UR19 — канал push-уведомлений (ntfy.sh или свой сервер)" },
  simplex: { status: "ours", where: "UR19 — мессенджер; демон simplex-chat на машине человека" },
  buzz: { status: "ours", where: "UR19 — мессенджер поверх Nostr; нужен сторонний двоичный buzz CLI" },
  raft: { status: "ours", where: "UR19 — мессенджер рабочего пространства Raft; нужен сторонний Raft CLI" },
  photon: { status: "ours", where: "UR19 — iMessage через управляемую площадку Photon Spectrum и Node-посредник" },
  teams: { status: "ours", where: "UR34 — Teams назван прямо (Microsoft Graph выведен из HX11)" },
  msgraph_webhook: { status: "ours", where: "UR34 — уведомления об изменениях Microsoft Graph" },

  // ── исключено номером SPEC ──────────────────────────────────────────────
  discord: { status: "excluded", hx: "HX11", where: "Discord" },
  homeassistant: { status: "excluded", hx: "HX11", where: "Home Assistant" },
  feishu: { status: "excluded", hx: "HX11", where: "Feishu" },
  yuanbao: { status: "excluded", hx: "HX11", where: "Yuanbao" },
  api_server: { status: "excluded", hx: "HX10", where: "OpenAI-совместимый API-сервер" },

  // Решение владельца 2026-09-09 (замечание D-81): исключено РАСШИРЕНИЕМ HX3, а не
  // новым номером — основание у него то же, что у их облака, и отдельная запись
  // развела бы один довод по двум местам.
  relay: {
    status: "excluded",
    hx: "HX3",
    where:
      "их коннектор как транспорт переписки: шлюз дозванивается наружу к отдельной " +
      "службе (NousResearch/gateway-gateway), и та фронтит платформы вместо него",
  },
};

/** Ids the static `PLATFORMS` table carries but the Channels catalog never
 * shows. They are not cards and get no verdict — printed as a note so the
 * difference stays measured instead of looking like a hole. */
export const NOT_A_CARD = {
  cli: "их собственный терминал — вход ядра, а не канал нашего окна",
  cron: "расписания; наш тик — aec/cron-runner/**, инструмент `cronjob` уже разобран на оси инструментов (UR18)",
};

/** Asks the core for its own entrances — the very catalog their Channels page
 * reads, plus the static table and the platform bundles for the cross-check.
 * Fails loudly: a silent empty answer would report an axis of zero entrances
 * and call it parity. */
export function readPlatforms({ python = PYTHON_BIN, src = HERMES_SRC_DIR } = {}) {
  const code = [
    "import json",
    // The private name is deliberate: this is the function their REST route
    // `/api/messaging/platforms` calls, so the registry measures the list the
    // window shows, not a second list that agrees with it today.
    "from hermes_cli.web_server import _messaging_platform_catalog",
    "from hermes_cli.platforms import PLATFORMS",
    "import toolsets",
    "cat = _messaging_platform_catalog()",
    "out = {",
    '  "catalog": [str(e.get("id")) for e in cat],',
    '  "static": [k for k in PLATFORMS],',
    '  "defaultToolsets": {k: v.default_toolset for k, v in PLATFORMS.items()},',
    '  "bundles": sorted(k for k in toolsets.TOOLSETS if k.startswith("hermes-")),',
    "}",
    'print("PLATFORM_JSON " + json.dumps(out))',
  ].join("\n");

  const answer = execFileSync(python, ["-c", code], { cwd: src, encoding: "utf-8" });
  const line = answer.split(/\r?\n/).find((one) => one.startsWith("PLATFORM_JSON "));
  if (!line) throw new Error("ядро не отдало каталог платформ");

  const parsed = JSON.parse(line.slice("PLATFORM_JSON ".length));
  if (!parsed.catalog || parsed.catalog.length === 0) throw new Error("каталог платформ ядра пуст");
  return parsed;
}

/** Our shortlist, read from the module that enforces it rather than copied. A
 * copy would keep agreeing with itself after somebody edited the real list. */
export function readShortlist(sourceText) {
  const block = /CHANNEL_SHORTLIST[^=]*=\s*\[([^\]]*)\]/s.exec(sourceText);
  return block ? [...block[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]) : [];
}

/** Finding ids (`D-81`) TASKS.md still carries, and those already closed. The
 * task parsers cannot read them: a finding id has a hyphen. */
export function readFindingIds(tasksText) {
  return new Set([...tasksText.matchAll(/^- \[[ x]\] (D-\d+) /gm)].map((m) => m[1]));
}

export function readClosedFindingIds(tasksText) {
  return new Set([...tasksText.matchAll(/^- \[x\] (D-\d+) /gm)].map((m) => m[1]));
}

export function buildRegistry({
  platforms,
  shortlist,
  exclusions,
  taskIds,
  closedTaskIds = new Set(),
  findingIds = new Set(),
  closedFindingIds = new Set(),
  verdicts = VERDICTS,
}) {
  const catalog = [...platforms.catalog].sort();
  const inCatalog = new Set(catalog);

  const rows = [];
  const divergent = [];
  const badCitations = [];

  for (const id of catalog) {
    const verdict = verdicts[id];
    if (!verdict) {
      divergent.push({ id });
      continue;
    }

    if (verdict.status === "excluded" && !exclusions.includes(verdict.hx)) {
      badCitations.push(`${id}: §Non-Goals не содержит ${verdict.hx} (отменён или переименован)`);
    }
    if (verdict.status === "task" && !taskIds.has(verdict.task)) {
      badCitations.push(`${id}: в TASKS.md нет задачи ${verdict.task}`);
    } else if (verdict.status === "task" && closedTaskIds.has(verdict.task)) {
      badCitations.push(
        `${id}: задача ${verdict.task} ЗАКРЫТА — вердикт «работа впереди» пережил работу`
      );
    }
    if (verdict.status === "owner" && !findingIds.has(verdict.finding)) {
      badCitations.push(`${id}: в TASKS.md нет замечания ${verdict.finding}`);
    } else if (verdict.status === "owner" && closedFindingIds.has(verdict.finding)) {
      badCitations.push(
        `${id}: замечание ${verdict.finding} ЗАКРЫТО — решение принято, а строка всё ещё ждёт его`
      );
    }
    // The dangerous direction on this axis: a row promising a card the person
    // never sees. Our bridge owns that list, so the claim is checked against
    // the list itself.
    if (verdict.status === "shown" && !shortlist.includes(id)) {
      badCitations.push(`${id}: вердикт обещает карточку, но короткий список моста её не публикует`);
    }
    if (verdict.status !== "shown" && shortlist.includes(id)) {
      badCitations.push(`${id}: мост публикует карточку, а вердикт говорит другое («${verdict.status}»)`);
    }

    rows.push({ id, ...verdict });
  }

  // Our own promise into nowhere: a shortlist id the core does not ship would
  // leave the Channels page one card short with nothing to explain it.
  for (const id of shortlist) {
    if (!inCatalog.has(id)) {
      badCitations.push(`короткий список моста называет «${id}», а у ядра такого входа нет`);
    }
  }

  // A verdict for an entrance the core no longer ships is as wrong as a missing
  // one: it keeps answering for a surface that is gone.
  const stale = Object.keys(verdicts).filter((id) => !inCatalog.has(id));

  // Which bundle an entrance gets is THEIR mapping, not a name transformation:
  // `whatsapp_cloud` shares `hermes-whatsapp`, and guessing by name reported it
  // as a bundle-less entrance. Plugin platforms are absent from that table
  // altogether — they take the default set, which is a fact, not a gap.
  const bundleOf = platforms.defaultToolsets ?? {};
  const claimed = new Set(Object.values(bundleOf));
  const untabled = catalog.filter((id) => !(id in bundleOf));
  const withoutPlatform = platforms.bundles.filter((bundle) => !claimed.has(bundle));

  const notCards = platforms.static.filter((id) => !inCatalog.has(id));

  return {
    version: HERMES_VERSION,
    sha: HERMES_SHA,
    catalogCount: catalog.length,
    shortlist,
    rows,
    divergent,
    stale,
    badCitations,
    notCards,
    untabled,
    withoutPlatform,
  };
}

export function formatRegistry(registry) {
  const out = [];
  const say = (line = "") => out.push(line);

  say(`== ВХОДЫ ЯДРА ${registry.version} (${registry.sha.slice(0, 8)})`);
  say(
    `   ${registry.catalogCount} каналов в каталоге; наш мост публикует ${registry.shortlist.length} ` +
      `(${registry.shortlist.join(", ")}), включённый канал не прячется никогда`
  );
  say();

  const by = (status) => registry.rows.filter((row) => row.status === status);
  const verdictOf = (row) =>
    row.status === "excluded"
      ? row.hx
      : row.status === "task"
        ? `задача ${row.task}`
        : row.status === "owner"
          ? `замечание ${row.finding}`
          : row.status === "shown"
            ? "в списке"
            : "если включён";
  const line = (row) => `  ${row.id.padEnd(20)} ${verdictOf(row).padEnd(16)} — ${row.where}`;

  for (const [title, status] of [
    ["показываем в окне", "shown"],
    ["в объёме, карточки нет", "ours"],
    ["задача", "task"],
    ["исключено", "excluded"],
    ["у владельца", "owner"],
  ]) {
    const rows = by(status);
    if (rows.length === 0 && (status === "task" || status === "owner")) continue;
    say(`== ${title} (${rows.length})`);
    for (const row of rows) say(line(row));
    say();
  }

  say(`== РАСХОЖДЕНИЕ (${registry.divergent.length})`);
  if (registry.divergent.length === 0) {
    say("  пусто — у каждого входа ядра есть решение, исключение, задача или замечание владельцу");
  } else {
    for (const row of registry.divergent) say(`  ${row.id.padEnd(20)} решения нет`);
    say("  правило фазы: новое расхождение выносится ВЛАДЕЛЬЦУ, а не закрывается задачей,");
    say("  которая его нашла.");
  }
  say();

  if (registry.notCards.length > 0) {
    say(`== НЕ КАНАЛ (${registry.notCards.length})`);
    say("  их статическая таблица платформ знает эти входы, каталог окна — нет:");
    for (const id of registry.notCards) say(`  ${id.padEnd(20)} ${NOT_A_CARD[id] ?? "пояснения нет"}`);
    say();
  }

  if (registry.untabled.length > 0 || registry.withoutPlatform.length > 0) {
    say("== СВЯЗКИ ИНСТРУМЕНТОВ");
    say("  связка задаёт, какие инструменты получает бот на платформе; её отсутствие");
    say("  означает набор по умолчанию, а не разрыв.");
    if (registry.untabled.length > 0) {
      say(
        `  вне их таблицы связок (${registry.untabled.length}, плагинные входы и поздние встроенные): ` +
          registry.untabled.join(", ")
      );
    }
    if (registry.withoutPlatform.length > 0) {
      say(`  связка, которой не отвечает ни один вход (${registry.withoutPlatform.length}): ${registry.withoutPlatform.join(", ")}`);
    }
    say();
  }

  if (registry.stale.length > 0) {
    say(`== ВЕРДИКТ БЕЗ ПЛАТФОРМЫ (${registry.stale.length})`);
    say("  ядро больше не отдаёт эти входы — вердикт отвечает за поверхность, которой нет:");
    for (const id of registry.stale) say(`  ${id}`);
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
  const tasksText = fs.readFileSync(TASKS_FILE, "utf-8");
  const registry = buildRegistry({
    platforms: readPlatforms(),
    shortlist: readShortlist(fs.readFileSync(SHORTLIST_FILE, "utf-8")),
    exclusions: readExclusions(fs.readFileSync(SPEC_FILE, "utf-8")),
    taskIds: readTaskIds(tasksText),
    closedTaskIds: readClosedTaskIds(tasksText),
    findingIds: readFindingIds(tasksText),
    closedFindingIds: readClosedFindingIds(tasksText),
  });

  console.log(formatRegistry(registry));

  const jsonAt = process.argv.indexOf("--json");
  if (jsonAt !== -1 && process.argv[jsonAt + 1]) {
    fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(registry, null, 2) + "\n", "utf-8");
  }

  process.exitCode =
    registry.divergent.length + registry.stale.length + registry.badCitations.length > 0 ? 1 : 0;
}
