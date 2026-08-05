// Records what the installed hermes core offers and what this app depends on in
// it, so the next upgrade can be diffed instead of re-derived by hand.
//
// Why this exists: upgrading 0.18.0 → 0.19.0 turned up exactly one thing that
// mattered, and it broke nothing loudly — `model.options` stopped forcing
// `include_unconfigured`, and the provider screen would have quietly shrunk
// from 41 providers to 3. Finding that took a hand-comparison across seven
// dimensions, chosen from memory. This script writes those dimensions down.
//
// Two views, deliberately both:
//   * the CORE's full surface (every gateway method, every REST route, every
//     config default) — so a change we do not use yet is still visible when we
//     reach for it;
//   * OUR dependency surface (the methods and routes our main process actually
//     calls) — read from our own source, so it stays true as the app grows and
//     a core method we never touch never shows up as noise.
//
// Usage:
//   node runtime/contract-snapshot.mjs            — write the baseline
//   node runtime/contract-snapshot.mjs --print    — print it, write nothing
//
// Compare two of these with runtime/contract-diff.mjs.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HERMES_SHA, HERMES_SRC_DIR, HERMES_VERSION, PYTHON_BIN, VENV_DIR } from "./hermes-env.mjs";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(RUNTIME_DIR, "..");
const OUT_DIR = path.join(RUNTIME_DIR, "contracts");

/** The snapshot's own shape. Bumped when a section is added or its meaning
 * changes, so contract-diff can say "this pair is not comparable here" instead
 * of reporting an absent section as a removal. */
const SNAPSHOT_FORMAT = 2;

/** Where the core's Python actually lives. Since 0.20.0 the install is editable
 * (their build backend refuses to build a wheel — see PLAN §Stack), so the
 * modules sit in the source checkout and site-packages holds only a .pth. The
 * site-packages branch stays for the day a normal install becomes possible
 * again. */
function coreRoot() {
  const candidates = [HERMES_SRC_DIR, path.join(VENV_DIR, "Lib", "site-packages")];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "tui_gateway"))) return dir;
  }
  throw new Error(
    `no hermes core found — looked for tui_gateway/ in:\n  ${candidates.join("\n  ")}\n` +
      "run `node runtime/setup.mjs` first",
  );
}

const CORE_DIR = coreRoot();

function read(file) {
  return fs.readFileSync(file, "utf-8");
}

function readIfPresent(file) {
  return fs.existsSync(file) ? read(file) : "";
}

function shortHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------- core: gateway

/** Gateway source, wherever they keep it. 0.18/0.19 held everything in
 * `server.py`; 0.19.1 split it into `methods_*.py`, so the whole directory is
 * read and the file each method lives in is recorded — a method that MOVED is
 * then visibly different from one that CHANGED. */
function gatewaySources() {
  const dir = path.join(CORE_DIR, "tui_gateway");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".py"))
    .map((name) => ({ name, text: read(path.join(dir, name)) }));
}

// Registration decorators. Most handlers use `@method("x")`; the projects CRUD
// goes through a wrapper (`@_projects_method("x")`) that injects the DB handle.
// Both register a callable RPC, so both belong in the inventory — counting only
// the first would silently omit eleven methods.
const METHOD_DECORATOR = /@(?:method|_[a-z_]+_method)\(\s*"([a-z_.]+)"\s*\)/g;

/** Default values a handler reads out of its JSON-RPC params, as literals.
 *
 * This is the section that would have caught 0.18 → 0.19: the signature does
 * not change when `params.get("include_unconfigured", True)` becomes
 * `params.get("include_unconfigured", False)`, the handler still answers, and
 * the screen just shows less. Only simple literals are captured — an expression
 * with its own call or comma is not a default anyone can compare across
 * versions, and a false entry in a diagnostic is worse than a missing one. */
function paramDefaults(body) {
  const found = {};
  for (const m of body.matchAll(/\.get\(\s*"([A-Za-z0-9_]+)"\s*,\s*([^,()[\]{}]+?)\s*\)/g)) {
    const [, key, literal] = m;
    if (/^(True|False|None|-?\d+(\.\d+)?|"[^"]*"|'[^']*')$/.test(literal)) {
      found[key] = literal;
    }
  }
  return Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
}

/** Body of one registered handler: everything up to the next registration.
 * Hashed rather than stored — the point is "did it change", and a snapshot
 * carrying thousands of lines of someone else's source would be unreadable. */
function handlerBody(text, at, markerLength) {
  const rest = text.slice(at + markerLength);
  const next = rest.search(/\n@(?:method|_[a-z_]+_method)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** Every RPC the gateway registers, with the module it lives in. */
function gatewayMethods(sources) {
  const methods = {};
  for (const { name, text } of sources) {
    for (const match of text.matchAll(METHOD_DECORATOR)) {
      const body = handlerBody(text, match.index, match[0].length);
      methods[match[1]] = {
        file: name,
        lines: body.split("\n").length,
        hash: shortHash(body.trim()),
        defaults: paramDefaults(body),
      };
    }
  }
  return Object.fromEntries(Object.entries(methods).sort(([a], [b]) => a.localeCompare(b)));
}

// ------------------------------------------------------------------ core: REST

/** Every REST route the core declares, with the file that declares it. 0.19.1
 * moved most of them out of the `web_server.py` monolith into
 * `hermes_cli/web_routers/`; reading only one of the two makes every moved
 * route read as deleted. */
function coreRestRoutes() {
  const files = [];
  const monolith = path.join(CORE_DIR, "hermes_cli", "web_server.py");
  if (fs.existsSync(monolith)) files.push({ name: "web_server.py", text: read(monolith) });

  const routersDir = path.join(CORE_DIR, "hermes_cli", "web_routers");
  if (fs.existsSync(routersDir)) {
    for (const name of fs.readdirSync(routersDir).filter((n) => n.endsWith(".py"))) {
      files.push({ name: `web_routers/${name}`, text: read(path.join(routersDir, name)) });
    }
  }

  const routes = {};
  for (const { name, text } of files) {
    const decorator = /@[A-Za-z_][A-Za-z0-9_.]*\.(get|post|put|patch|delete|websocket)\(\s*"([^"]+)"/g;
    for (const [, verb, route] of text.matchAll(decorator)) {
      routes[`${verb.toUpperCase()} ${route}`] = name;
    }
  }
  return Object.fromEntries(Object.entries(routes).sort(([a], [b]) => a.localeCompare(b)));
}

// -------------------------------------------------------- core: config + deps

/** DEFAULT_CONFIG and the dependency pins, read out of the installed core by
 * the core's own Python. Parsing a 3000-line dict literal with a regex would be
 * guesswork; importing it is exact, and the venv has to work for the snapshot to
 * mean anything anyway. Keys are flattened to dotted paths so a diff can name
 * the one that moved. */
function coreConfigAndDeps() {
  const script = `
import json
from importlib.metadata import requires
from hermes_cli import config_defaults

def flatten(prefix, value, out):
    if isinstance(value, dict) and value:
        for key, item in value.items():
            flatten(f"{prefix}.{key}" if prefix else str(key), item, out)
    else:
        out[prefix] = value

flat = {}
flatten("", config_defaults.DEFAULT_CONFIG, flat)
print(json.dumps({
    "configDefaults": dict(sorted(flat.items())),
    "requiresDist": sorted(requires("hermes-agent") or []),
}, default=str))
`;
  const result = spawnSync(PYTHON_BIN, ["-c", script], {
    encoding: "utf-8",
    cwd: CORE_DIR, // their modules import each other by top-level name
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`reading core config defaults failed:\n${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

// ----------------------------------------------------------------- our surface

/** Every gateway method our main process calls. Read from our source rather
 * than listed here, so a call added later is covered without anyone remembering
 * to update this file. */
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

// ------------------------------------------------------------------------ main

function main() {
  const sources = gatewaySources();
  const allMethods = gatewayMethods(sources);
  const restRoutes = coreRestRoutes();
  const { configDefaults, requiresDist } = coreConfigAndDeps();

  const ourMethodView = {};
  for (const method of ourMethods()) {
    ourMethodView[method] = allMethods[method] ?? { file: null, lines: 0, hash: null, defaults: {} };
  }

  const ourRouteView = {};
  const declaredPaths = new Set(Object.keys(restRoutes).map((key) => key.split(" ")[1]));
  for (const route of ourRestRoutes()) {
    ourRouteView[route] = [...declaredPaths].some((declared) => declared.startsWith(route));
  }

  const allText = sources.map((s) => s.text).join("\n");
  const emitted = [
    ...new Set([...allText.matchAll(/_emit\(\s*"([a-z_.]+)"/g)].map((m) => m[1]))
  ].sort();

  const checkpointManager = readIfPresent(path.join(CORE_DIR, "tools", "checkpoint_manager.py"));
  const markerBlock = checkpointManager.match(/markers = \{([^}]*)\}/);
  const markers = markerBlock
    ? [...markerBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
    : [];

  const snapshot = {
    snapshotFormat: SNAPSHOT_FORMAT,
    hermesVersion: HERMES_VERSION,
    hermesSha: HERMES_SHA,
    takenBy: "runtime/contract-snapshot.mjs",
    note:
      "Поверхность ядра и наша зависимость от неё. Сравнивать через " +
      "runtime/contract-diff.mjs ПЕРЕД обновлением: изменившийся hash " +
      "обработчика = повод прочитать диф, изменившийся file = метод просто " +
      "переехал, изменившийся defaults = молчаливая смена умолчания. " +
      "Отсутствующий метод или маршрут = сломанный экран.",
    gatewayModules: sources
      .map((s) => ({
        name: s.name,
        lines: s.text.split("\n").length,
        methods: Object.values(allMethods).filter((m) => m.file === s.name).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    gatewayMethods: allMethods,
    gatewayEmittedEvents: emitted,
    coreRestRoutes: restRoutes,
    configDefaults,
    requiresDist,
    checkpointMarkers: markers,
    ourMethods: ourMethodView,
    ourRestRoutes: ourRouteView,
    ourEvents: ourEvents(),
  };

  if (process.argv.includes("--print")) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `hermes-${HERMES_VERSION}.json`);
  fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

  const missing = Object.entries(ourMethodView).filter(([, v]) => v.hash === null);
  const missingRoutes = Object.entries(ourRouteView).filter(([, present]) => !present);
  const withDefaults = Object.values(allMethods).filter((m) => Object.keys(m.defaults).length > 0);
  console.log(`слепок ядра ${HERMES_VERSION} (${HERMES_SHA.slice(0, 12)}) → ${path.relative(REPO_DIR, out)}`);
  console.log(`  ядро: методов ${Object.keys(allMethods).length} в ${snapshot.gatewayModules.length} модулях, ` +
    `маршрутов ${Object.keys(restRoutes).length}, дефолтов конфига ${Object.keys(configDefaults).length}`);
  console.log(`  умолчания параметров записаны у ${withDefaults.length} методов`);
  console.log(`  наша поверхность: методов ${Object.keys(ourMethodView).length}, маршрутов ${Object.keys(ourRouteView).length}`);
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
