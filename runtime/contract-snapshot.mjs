// Records what this app depends on in the installed hermes core, so the next
// upgrade can be diffed instead of re-derived by hand.
//
// Why this exists: upgrading 0.18.0 → 0.19.0 turned up exactly one thing that
// mattered, and it broke nothing loudly — `model.options` stopped forcing
// `include_unconfigured`, and the provider screen would have quietly shrunk
// from 41 providers to 3. Finding that took a hand-comparison across seven
// dimensions, chosen from memory. This script writes those dimensions down.
//
// It records ONLY our dependency surface, not theirs: the method list comes
// from OUR main process, so it stays true as batches add calls, and a hermes
// method we never touch never shows up as noise.
//
// Usage:
//   node runtime/contract-snapshot.mjs            — write the baseline
//   node runtime/contract-snapshot.mjs --print    — print it, write nothing
//
// The comparator that reads two of these is deliberately NOT written yet —
// there is nothing to compare against until the next release lands.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HERMES_VERSION, VENV_DIR } from "./hermes-env.mjs";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(RUNTIME_DIR, "..");
const SITE_PACKAGES = path.join(VENV_DIR, "Lib", "site-packages");
const OUT_DIR = path.join(RUNTIME_DIR, "contracts");

function read(file) {
  return fs.readFileSync(file, "utf-8");
}

function readIfPresent(file) {
  return fs.existsSync(file) ? read(file) : "";
}

/** Every gateway method our main process calls. Read from our source rather
 * than listed here, so a call added in a later batch is covered without anyone
 * remembering to update this file. */
function ourMethods() {
  const source = read(path.join(REPO_DIR, "apps/desktop/src/main/index.ts"));
  return [...new Set([...source.matchAll(/gateway\.request\(\s*'([a-z_.]+)'/g)].map((m) => m[1]))].sort();
}

/** Every REST path our main process builds. The `${...}` fragments of a
 * template literal are cut back to the static prefix — that is what identifies
 * the route. */
function ourRestRoutes() {
  const source = read(path.join(REPO_DIR, "apps/desktop/src/main/index.ts"));
  const raw = [...source.matchAll(/`?(\/api\/[a-zA-Z0-9/_-]*)/g)]
    .map((m) => m[1])
    // A route built as `/api/mcp/servers/${name}/test` yields the prefix with
    // a trailing slash; without this it reads as a seventh route that does not
    // exist, and a false entry in a diagnostic is worse than a missing one.
    .map((route) => route.replace(/\/$/, ""));
  return [...new Set(raw.filter((route) => route.length > 5))].sort();
}

/** The two event lists the chat reducer keeps, which are also what the parity
 * warning and `hermes-event-diff.mjs` read. */
function ourEvents() {
  const source = read(path.join(REPO_DIR, "apps/desktop/src/renderer/src/chat/chat-state.ts"));
  const pick = (name) => {
    const start = source.indexOf(`export const ${name}`);
    if (start === -1) return [];
    const end = source.indexOf("] as const", start);
    return [...source.slice(start, end).matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
  };
  return { handled: pick("HANDLED_GATEWAY_EVENTS"), ignored: pick("IGNORED_GATEWAY_EVENTS") };
}

/** Gateway source, wherever they keep it. 0.18/0.19 hold everything in
 * `server.py`; 0.19.1 splits it into `methods_*.py`, so the whole directory is
 * read and the file each method lives in is recorded — a method that MOVED is
 * then visibly different from one that CHANGED. */
function gatewaySources() {
  const dir = path.join(SITE_PACKAGES, "tui_gateway");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".py"))
    .map((name) => ({ name, text: read(path.join(dir, name)) }));
}

function shortHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** Body of one `@method("x")` handler: everything up to the next decorator.
 * Hashed rather than stored — the point is "did it change", and a snapshot
 * carrying thousands of lines of someone else's source would be unreadable. */
function handlerOf(sources, method) {
  const marker = `@method("${method}")`;
  for (const { name, text } of sources) {
    const at = text.indexOf(marker);
    if (at === -1) continue;
    const rest = text.slice(at + marker.length);
    const next = rest.indexOf("\n@method(");
    const body = next === -1 ? rest : rest.slice(0, next);
    return { file: name, lines: body.split("\n").length, hash: shortHash(body.trim()) };
  }
  return { file: null, lines: 0, hash: null };
}

function main() {
  const sources = gatewaySources();
  const webServer = readIfPresent(path.join(SITE_PACKAGES, "hermes_cli", "web_server.py"));
  // 0.19.1 moves routes into `hermes_cli/web_routers/`; read those too when
  // they exist, so a route that merely moved does not read as removed.
  const routersDir = path.join(SITE_PACKAGES, "hermes_cli", "web_routers");
  const routerText = fs.existsSync(routersDir)
    ? fs
        .readdirSync(routersDir)
        .filter((n) => n.endsWith(".py"))
        .map((n) => read(path.join(routersDir, n)))
        .join("\n")
    : "";
  const restText = `${webServer}\n${routerText}`;

  const methods = {};
  for (const method of ourMethods()) methods[method] = handlerOf(sources, method);

  const routes = {};
  for (const route of ourRestRoutes()) routes[route] = restText.includes(`"${route}`);

  const allText = sources.map((s) => s.text).join("\n");
  const emitted = [
    ...new Set([...allText.matchAll(/_emit\(\s*"([a-z_.]+)"/g)].map((m) => m[1]))
  ].sort();

  const checkpointManager = readIfPresent(
    path.join(SITE_PACKAGES, "tools", "checkpoint_manager.py")
  );
  const markerBlock = checkpointManager.match(/markers = \{([^}]*)\}/);
  const markers = markerBlock
    ? [...markerBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
    : [];

  const snapshot = {
    hermesVersion: HERMES_VERSION,
    takenBy: "runtime/contract-snapshot.mjs",
    note:
      "Наша поверхность зависимости от ядра. Сравнить со слепком новой версии " +
      "ПЕРЕД обновлением: изменившийся hash обработчика = повод прочитать диф, " +
      "изменившийся file = метод просто переехал. Отсутствующий метод или " +
      "маршрут = сломанный экран.",
    ourMethods: methods,
    ourRestRoutes: routes,
    ourEvents: ourEvents(),
    gatewayEmittedEvents: emitted,
    checkpointMarkers: markers,
    gatewayFiles: sources.map((s) => ({ name: s.name, lines: s.text.split("\n").length }))
  };

  if (process.argv.includes("--print")) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `hermes-${HERMES_VERSION}.json`);
  fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

  const missing = Object.entries(methods).filter(([, v]) => v.hash === null);
  const missingRoutes = Object.entries(routes).filter(([, present]) => !present);
  console.log(`слепок ядра ${HERMES_VERSION} → ${path.relative(REPO_DIR, out)}`);
  console.log(`  методов: ${Object.keys(methods).length}, маршрутов: ${Object.keys(routes).length}`);
  console.log(`  событий обрабатываем: ${snapshot.ourEvents.handled.length}, игнорируем: ${snapshot.ourEvents.ignored.length}`);
  console.log(`  ядро эмитит событий: ${emitted.length}, маркеров чекпойнтов: ${markers.length}`);
  if (missing.length > 0) {
    console.log(`  ВНИМАНИЕ, метод не найден в ядре: ${missing.map(([k]) => k).join(", ")}`);
  }
  if (missingRoutes.length > 0) {
    console.log(`  ВНИМАНИЕ, маршрут не найден: ${missingRoutes.map(([k]) => k).join(", ")}`);
  }
}

main();
