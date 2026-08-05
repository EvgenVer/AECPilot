// Compares two core snapshots (runtime/contracts/hermes-*.json) and reports
// what an upgrade actually changed, in three sections:
//
//   сломалось              — было и исчезло
//   появилось              — не было и появилось
//   молча сменило умолчание — осталось на месте и ведёт себя иначе
//
// The third section is the one this tool exists for. 0.18 → 0.19 broke nothing
// loudly: `model.options` kept its name, kept its signature, kept answering —
// it just stopped forcing `include_unconfigured`, and the provider screen would
// have shrunk from 41 providers to 3 without a single error. Everything that
// keeps its name while changing its behaviour lands there: a changed default
// (method parameter or config key), a changed dependency pin, a moved handler,
// a rewritten handler body.
//
// Sections are not comparable when the older snapshot predates them. That is
// reported as such — replaying 141 methods as "появилось" because the old file
// never recorded them would bury the four lines that matter.
//
// Usage:
//   node runtime/contract-diff.mjs                      — two newest snapshots
//   node runtime/contract-diff.mjs <old.json> <new.json>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONTRACTS_DIR = path.join(RUNTIME_DIR, "contracts");

/** Section keys a snapshot may or may not carry, by snapshot format. A section
 * missing from the OLDER snapshot is not a removal — it is an absence of
 * evidence, and the two are not the same thing. */
function has(snapshot, section) {
  return Object.prototype.hasOwnProperty.call(snapshot, section);
}

function keysOf(value) {
  return value && typeof value === "object" ? Object.keys(value) : [];
}

/** Compares one name → value map. `describe` turns a value into the string the
 * report shows; `changed` decides whether two present values differ. */
function diffMap(oldMap, newMap, { kind, describe, changed, isOurs = () => false }) {
  const broken = [];
  const added = [];
  const silent = [];

  for (const name of keysOf(oldMap)) {
    if (!(name in (newMap ?? {}))) {
      broken.push({ kind, name, detail: describe(oldMap[name]), ours: isOurs(name) });
      continue;
    }
    const change = changed(oldMap[name], newMap[name]);
    if (change) silent.push({ kind, name, ...change, ours: isOurs(name) });
  }
  for (const name of keysOf(newMap)) {
    if (!(name in (oldMap ?? {}))) added.push({ kind, name, detail: describe(newMap[name]) });
  }
  return { broken, added, silent };
}

/** Same, for a plain list of names. */
function diffList(oldList, newList, kind) {
  const before = new Set(oldList ?? []);
  const after = new Set(newList ?? []);
  return {
    broken: [...before].filter((n) => !after.has(n)).map((name) => ({ kind, name })),
    added: [...after].filter((n) => !before.has(n)).map((name) => ({ kind, name })),
    silent: [],
  };
}

/** A dependency line like `mcp==1.28.1` or `starlette>=1.3.1 ; extra == "mcp"`
 * splits into the package name and the rest, so a re-pinned dependency reads as
 * a changed pin rather than one removal plus one addition. */
function splitRequirement(line) {
  const match = /^\s*([A-Za-z0-9._-]+)\s*(.*)$/.exec(line);
  return match ? { name: match[1].toLowerCase(), spec: match[2].trim() } : { name: line, spec: "" };
}

function byName(requirements) {
  const out = {};
  for (const line of requirements ?? []) {
    const { name, spec } = splitRequirement(line);
    out[name] = spec;
  }
  return out;
}

/** What changed about a single gateway handler that kept its name.
 *
 * Order matters: a changed default is named explicitly, because "the body
 * changed" is what a reader skips over and "the default flipped" is what costs
 * a screen. */
function handlerChange(before, after, defaultsComparable) {
  const notes = [];
  if (defaultsComparable) {
    const oldDefaults = before.defaults ?? {};
    const newDefaults = after.defaults ?? {};
    for (const key of Object.keys(oldDefaults)) {
      if (!(key in newDefaults)) {
        notes.push(`умолчание ${key}=${oldDefaults[key]} исчезло (параметр стал обязательным?)`);
      } else if (newDefaults[key] !== oldDefaults[key]) {
        notes.push(`умолчание ${key}: ${oldDefaults[key]} → ${newDefaults[key]}`);
      }
    }
    for (const key of Object.keys(newDefaults)) {
      if (!(key in oldDefaults)) notes.push(`появилось умолчание ${key}=${newDefaults[key]}`);
    }
  }
  if (before.file !== after.file) notes.push(`переехал: ${before.file} → ${after.file}`);
  if (before.hash !== after.hash) notes.push(`тело изменилось (${before.lines} → ${after.lines} строк)`);
  return notes.length > 0 ? { notes } : null;
}

/**
 * Diffs two snapshots. Pure: takes parsed objects, returns a plain report.
 */
export function diffSnapshots(oldSnapshot, newSnapshot) {
  const sections = [
    "gatewayMethods",
    "coreRestRoutes",
    "configDefaults",
    "requiresDist",
    "gatewayEmittedEvents",
    "checkpointMarkers",
    "ourMethods",
    "ourRestRoutes",
  ];
  const comparable = {};
  for (const section of sections) {
    comparable[section] = has(oldSnapshot, section) && has(newSnapshot, section);
  }

  // Defaults arrived with snapshot format 2; comparing them against a format-1
  // snapshot would report every default in the core as newly appeared.
  const defaultsComparable =
    (oldSnapshot.snapshotFormat ?? 1) >= 2 && (newSnapshot.snapshotFormat ?? 1) >= 2;

  const ours = new Set(keysOf(newSnapshot.ourMethods ?? oldSnapshot.ourMethods));
  const parts = [];

  if (comparable.gatewayMethods) {
    parts.push(
      diffMap(oldSnapshot.gatewayMethods, newSnapshot.gatewayMethods, {
        kind: "метод",
        describe: (v) => v.file ?? "?",
        changed: (a, b) => handlerChange(a, b, defaultsComparable),
        isOurs: (name) => ours.has(name),
      }),
    );
  } else if (comparable.ourMethods) {
    // Format-1 snapshots recorded only the methods we call. Less coverage, but
    // it is exactly the set whose loss breaks a screen.
    parts.push(
      diffMap(oldSnapshot.ourMethods, newSnapshot.ourMethods, {
        kind: "метод (наш вызов)",
        describe: (v) => v.file ?? "отсутствует в ядре",
        changed: (a, b) => {
          if (a.hash === null && b.hash === null) return null;
          if (b.hash === null) return { notes: ["ИСЧЕЗ из ядра"] };
          if (a.hash === null) return { notes: ["появился в ядре"] };
          return handlerChange(a, b, defaultsComparable);
        },
        isOurs: () => true,
      }),
    );
  }

  if (comparable.coreRestRoutes) {
    parts.push(
      diffMap(oldSnapshot.coreRestRoutes, newSnapshot.coreRestRoutes, {
        kind: "маршрут",
        describe: (v) => String(v),
        changed: (a, b) => (a === b ? null : { notes: [`переехал: ${a} → ${b}`] }),
      }),
    );
  } else if (comparable.ourRestRoutes) {
    parts.push(
      diffMap(oldSnapshot.ourRestRoutes, newSnapshot.ourRestRoutes, {
        kind: "маршрут (наш вызов)",
        describe: (v) => (v ? "есть в ядре" : "ОТСУТСТВУЕТ в ядре"),
        changed: (a, b) => (a === b ? null : { notes: [b ? "появился в ядре" : "ИСЧЕЗ из ядра"] }),
        isOurs: () => true,
      }),
    );
  }

  if (comparable.configDefaults) {
    parts.push(
      diffMap(oldSnapshot.configDefaults, newSnapshot.configDefaults, {
        kind: "дефолт конфига",
        describe: (v) => JSON.stringify(v),
        changed: (a, b) =>
          JSON.stringify(a) === JSON.stringify(b)
            ? null
            : { notes: [`${JSON.stringify(a)} → ${JSON.stringify(b)}`] },
      }),
    );
  }

  if (comparable.requiresDist) {
    parts.push(
      diffMap(byName(oldSnapshot.requiresDist), byName(newSnapshot.requiresDist), {
        kind: "зависимость",
        describe: (v) => v || "(без пина)",
        changed: (a, b) => (a === b ? null : { notes: [`${a || "(без пина)"} → ${b || "(без пина)"}`] }),
      }),
    );
  }

  if (comparable.gatewayEmittedEvents) {
    parts.push(diffList(oldSnapshot.gatewayEmittedEvents, newSnapshot.gatewayEmittedEvents, "событие"));
  }
  if (comparable.checkpointMarkers) {
    parts.push(diffList(oldSnapshot.checkpointMarkers, newSnapshot.checkpointMarkers, "маркер чекпойнта"));
  }

  // Ours first inside each section: a lost method we call is a broken screen,
  // a lost method we never call is trivia.
  const rank = (a, b) => Number(Boolean(b.ours)) - Number(Boolean(a.ours));

  return {
    from: { version: oldSnapshot.hermesVersion, sha: oldSnapshot.hermesSha ?? null },
    to: { version: newSnapshot.hermesVersion, sha: newSnapshot.hermesSha ?? null },
    comparable,
    defaultsComparable,
    broken: parts.flatMap((p) => p.broken).sort(rank),
    added: parts.flatMap((p) => p.added),
    silent: parts.flatMap((p) => p.silent).sort(rank),
  };
}

/** Renders a diff as the text a human reads before deciding to upgrade. */
export function formatReport(diff) {
  const lines = [];
  const mark = (entry) => (entry.ours ? " ← МЫ ЭТО ВЫЗЫВАЕМ" : "");

  lines.push(`дифф контракта ядра: ${diff.from.version} → ${diff.to.version}`);
  const skipped = Object.entries(diff.comparable)
    .filter(([, ok]) => !ok)
    .map(([section]) => section);
  if (skipped.length > 0) {
    lines.push(`  не сравнивается (нет в старом слепке): ${skipped.join(", ")}`);
  }
  if (!diff.defaultsComparable) {
    lines.push("  умолчания параметров не сравниваются: старый слепок их не записывал");
  }

  lines.push("", `== сломалось (${diff.broken.length})`);
  if (diff.broken.length === 0) lines.push("  ничего");
  for (const entry of diff.broken) {
    const where = entry.detail ? ` — было в ${entry.detail}` : "";
    lines.push(`  ${entry.kind} ${entry.name}${where}${mark(entry)}`);
  }

  lines.push("", `== появилось (${diff.added.length})`);
  if (diff.added.length === 0) lines.push("  ничего");
  for (const entry of diff.added) {
    lines.push(`  ${entry.kind} ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
  }

  lines.push("", `== молча сменило умолчание (${diff.silent.length})`);
  if (diff.silent.length === 0) lines.push("  ничего");
  for (const entry of diff.silent) {
    lines.push(`  ${entry.kind} ${entry.name}${mark(entry)}`);
    for (const note of entry.notes) lines.push(`      ${note}`);
  }

  return lines.join("\n");
}

/** The two newest snapshots in runtime/contracts, oldest first. */
function newestPair() {
  const files = fs
    .readdirSync(CONTRACTS_DIR)
    .filter((name) => name.startsWith("hermes-") && name.endsWith(".json"))
    .sort();
  if (files.length < 2) {
    throw new Error(`нужно два слепка в ${CONTRACTS_DIR}, найдено ${files.length}`);
  }
  return files.slice(-2).map((name) => path.join(CONTRACTS_DIR, name));
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [oldFile, newFile] = args.length === 2 ? args : newestPair();
  const read = (file) => JSON.parse(fs.readFileSync(file, "utf-8"));
  console.log(formatReport(diffSnapshots(read(oldFile), read(newFile))));
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
