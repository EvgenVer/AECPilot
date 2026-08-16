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
  hud: { task: "3.24", note: "оверлей поверх других окон, появился в 0.20.2" },
  "quick-entry": { task: "3.15", note: "быстрый ввод по глобальному хоткею" },
  "wake-indicator": { task: "3.7b", note: "индикатор слова-активатора" },
  webhooks: { task: "3.11", note: "исходящие вебхуки, UR19" },
  cron: { task: "3.5", note: "расписания, UR18" },
  messaging: { task: "3.9", note: "внешние каналы, UR19" },
};

/** RPC prefixes §Non-Goals excludes, for the reachability note. Each cites the
 * entry that named it, so the note cannot outlive its reason. */
export const EXCLUDED_RPC = [
  { prefix: "pet.", hx: "HX1" },
  { prefix: "billing.", hx: "HX2" },
  { prefix: "credits.", hx: "HX2" },
  { prefix: "image.generate", hx: "HX11" },
  { prefix: "window.read.", hx: "HX12" },
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

/** Methods the renderer may never name, from the deny list itself rather than a
 * copy of it. */
export function readDenied(denyText) {
  const block = /DENIED_RPC_METHODS[^=]*=\s*\[([^\]]*)\]/s.exec(denyText);
  return block ? [...block[1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]) : [];
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
export function buildRegistry({ surfaces, exclusions, taskIds, denied, from }) {
  const rows = Object.entries(surfaces).map(([name, counts]) =>
    classifySurface(name, { ...counts, rule: CLASSIFICATION[name] }),
  );

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

  lines.push("", `== есть у нас (${registry.ours.length})`);
  for (const r of registry.ours) {
    lines.push(`  ${r.id.padEnd(18)} файлов ${String(r.ours).padStart(3)}/${r.theirs}`);
  }

  lines.push("", `== исключено (${registry.excluded.length})`);
  for (const r of registry.excluded) {
    lines.push(`  ${r.id.padEnd(18)} ${r.hx}${r.note ? ` — ${r.note}` : ""}`);
  }

  lines.push("", `== запланировано (${registry.planned.length})`);
  for (const r of registry.planned) {
    lines.push(`  ${r.id.padEnd(18)} задача ${r.task}${r.note ? ` — ${r.note}` : ""}`);
  }

  lines.push("", `== РАСХОЖДЕНИЕ (${registry.gaps.length})`);
  if (registry.gaps.length === 0) {
    lines.push("  пусто — AC9 выполнен: у каждого их экрана есть перенос, исключение или задача");
  }
  for (const r of registry.gaps) {
    lines.push(`  ${r.id.padEnd(18)} их файлов: ${r.theirs} — НУЖНО решение: перенос, §Non-Goals или задача`);
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
  process.exitCode = registry.gaps.length > 0 || registry.problems.length > 0 ? 1 : 0;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
