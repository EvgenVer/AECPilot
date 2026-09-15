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
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HERMES_SHA, HERMES_SRC_DIR, HERMES_VERSION, PYTHON_BIN, VENV_DIR } from "./hermes-env.mjs";

const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(RUNTIME_DIR, "..");
const OUT_DIR = path.join(RUNTIME_DIR, "contracts");

/** The snapshot's own shape. Bumped when a section is added or its meaning
 * changes, so contract-diff can say "this pair is not comparable here" instead
 * of reporting an absent section as a removal.
 *   3 → 4 (0.21.2): gatewayMethods comes from the live registry instead of a
 *   decorator regex; per-method `line` and `via` added. A format-3 method
 *   inventory is incomplete against a format-4 one — regenerate the older side
 *   from a worktree of its SHA (`--core`, `--version`, `--sha`) before diffing. */
const SNAPSHOT_FORMAT = 4;

/** `--core <dir> --version <v> --sha <sha>` snapshot a checkout other than the
 * installed one — the previous pin in a `git worktree`, so both sides of a diff
 * are taken the same way. The venv still supplies the dependencies. */
function argValue(flag) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : process.argv[at + 1];
}
const CORE_OVERRIDE = argValue("--core");
const VERSION_LABEL = argValue("--version") ?? HERMES_VERSION;
const SHA_LABEL = argValue("--sha") ?? HERMES_SHA;

/** Where the core's Python actually lives. Since 0.20.0 the install is editable
 * (their build backend refuses to build a wheel — see PLAN §Stack), so the
 * modules sit in the source checkout and site-packages holds only a .pth. The
 * site-packages branch stays for the day a normal install becomes possible
 * again. */
function coreRoot() {
  if (CORE_OVERRIDE) {
    const dir = path.resolve(CORE_OVERRIDE);
    if (!fs.existsSync(path.join(dir, "tui_gateway"))) throw new Error(`no tui_gateway/ under --core ${dir}`);
    return dir;
  }
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

/** Every RPC the gateway registers, read from the gateway's OWN registry.
 *
 * Until 0.21.0 every handler was declared as `@method("x")` or
 * `@_projects_method("x")`, and a regex over the source was a complete
 * inventory. 0.21.2 registers in five shapes at once — `@_rpc("x", 5030)`,
 * `@_profile_handler("x", 5061)`, dict tables (`"tools.list": (5031, lambda …)`),
 * factory calls (`_correction_method("session.steer", …)`) and f-string names in
 * loops (`_rpc(f"learning.{name}", …)`) — and the regex found 119 of 225,
 * reporting `learning.delete` as gone when it was registered under a computed
 * name. So the inventory is now the registry itself: `tui_gateway.server`
 * fills `_methods` at import, and importing it in the core's venv (with a
 * throwaway HERMES_HOME so nothing of the dev profile is touched) is the only
 * reading that cannot miss a registration style invented next month.
 *
 * Per method: the module it lives in, the source of the innermost function
 * (decorator wrappers are unwrapped through `__wrapped__` and closure cells, so
 * four handlers minted by one factory hash differently), the `.get("k", literal)`
 * defaults found in that source, and a hash — the point is "did it change",
 * not a copy of someone else's source.
 *
 * `defaults` is the section that would have caught 0.18 → 0.19: the signature
 * does not change when `params.get("include_unconfigured", True)` becomes
 * `params.get("include_unconfigured", False)`, the handler still answers, and
 * the screen just shows less. Only simple literals are captured — an expression
 * with its own call or comma is not a default anyone can compare across
 * versions, and a false entry in a diagnostic is worse than a missing one. */
function gatewayMethodsLive() {
  const script = `
import hashlib, inspect, json, os, re, sys, types

sys.path.insert(0, os.getcwd())
import tui_gateway.server as server

CORE = os.path.abspath(os.getcwd())
# Under --core the editable install's own finder could still win over the
# worktree; a snapshot of the wrong tree is worse than none.
_loaded = os.path.abspath(server.__file__)
if not _loaded.startswith(CORE + os.sep):
    raise SystemExit(f"tui_gateway.server loaded from {_loaded}, expected under {CORE}")
GET_DEFAULT = re.compile(r'\\.get\\(\\s*"([A-Za-z0-9_]+)"\\s*,\\s*([^,()\\[\\]{}]+?)\\s*\\)')
LITERAL = re.compile(r'^(True|False|None|-?\\d+(\\.\\d+)?|"[^"]*"|\\'[^\\']*\\')$')

def unwrap(fn):
    """Down through decorator wrappers to the handler a person would read.
    functools.wraps leaves __wrapped__; their hand-rolled wrappers ('scoped',
    'handler') do not, but they hold the wrapped function in a closure cell
    named fn / func / handler / body. A closure with one function and no such
    name is followed too; anything else is the handler itself and stays."""
    seen = set()
    while id(fn) not in seen:
        seen.add(id(fn))
        if hasattr(fn, "__wrapped__"):
            fn = fn.__wrapped__
            continue
        names = getattr(getattr(fn, "__code__", None), "co_freevars", ())
        inner = [(n, c.cell_contents) for n, c in zip(names, getattr(fn, "__closure__", None) or ())
                 if _is_fn_cell(c)]
        if "<locals>" in fn.__qualname__:
            pick = [f for n, f in inner if n in ("fn", "func", "handler", "body", "inner")]
            if len(pick) == 1:
                fn = pick[0]
                continue
            if len(inner) == 1:
                fn = inner[0][1]
                continue
        break
    return fn

def _is_fn_cell(cell):
    try:
        return isinstance(cell.cell_contents, types.FunctionType)
    except ValueError:
        return False

def source_of(fn):
    try:
        lines, start = inspect.getsourcelines(fn)
        return "".join(lines), start
    except (OSError, TypeError):
        return "", 0

def stable_repr(value):
    """repr() that survives a process restart: a function inside a tuple or list
    (a lambda extractor in a params= spec, e.g. groups.log) would otherwise
    render as <function <lambda> at 0x...> and hash differently on every run."""
    if isinstance(value, types.FunctionType):
        src, _ = source_of(value)
        return "fn:" + value.__qualname__ + ":" + hashlib.sha256(src.encode()).hexdigest()[:12]
    if isinstance(value, (tuple, list)):
        inner = ", ".join(stable_repr(v) for v in value)
        return ("(" + inner + ")") if isinstance(value, tuple) else ("[" + inner + "]")
    return repr(value)

def closure_parts(fn, depth=0):
    """What a factory-made handler closes over: the inner functions (by source)
    and the plain values (by repr). Two handlers from one factory differ here."""
    parts, sources = [], []
    for cell in (getattr(fn, "__closure__", None) or ()):
        try:
            value = cell.cell_contents
        except ValueError:
            continue
        if isinstance(value, types.FunctionType):
            src, _ = source_of(value)
            sources.append(src)
            parts.append("fn:" + value.__qualname__ + ":" + hashlib.sha256(src.encode()).hexdigest()[:12])
            if depth < 2:
                inner_parts, inner_sources = closure_parts(value, depth + 1)
                parts.extend(inner_parts)
                sources.extend(inner_sources)
        elif isinstance(value, (str, int, float, bool, tuple, list, frozenset, set, type(None))):
            rendered = sorted(map(stable_repr, value)) if isinstance(value, (frozenset, set)) else stable_repr(value)
            parts.append("val:" + str(rendered))
        else:
            parts.append("obj:" + type(value).__name__)
    return parts, sources

def defaults_in(text):
    found = {}
    for key, literal in GET_DEFAULT.findall(text):
        if LITERAL.match(literal):
            found[key] = literal
    return dict(sorted(found.items()))

out = {}
for name, fn in server._methods.items():
    inner = unwrap(fn)
    src, start = source_of(inner)
    parts, extra_sources = closure_parts(inner)
    file = inspect.getsourcefile(inner) or ""
    rel = os.path.relpath(file, CORE).replace(os.sep, "/") if file else None
    if rel and rel.startswith("tui_gateway/"):
        rel = rel[len("tui_gateway/"):]
    material = src.strip() + "\\n" + "\\n".join(parts)
    out[name] = {
        "file": rel,
        "line": start,
        "lines": len(src.splitlines()),
        "hash": hashlib.sha256(material.encode()).hexdigest()[:12],
        "defaults": defaults_in("\\n".join([src, *extra_sources])),
        "via": inner.__qualname__,
    }
# The gateway owns stdout (JSON-RPC over stdio) and rebinds it on import, so the
# dump goes to a file, not to print().
with open(os.environ["AECPILOT_INVENTORY_OUT"], "w", encoding="utf-8") as fh:
    json.dump(dict(sorted(out.items())), fh)
`;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aecpilot-contract-home-"));
  const dump = path.join(home, "inventory.json");
  try {
    const result = spawnSync(PYTHON_BIN, ["-c", script], {
      encoding: "utf-8",
      cwd: CORE_DIR, // their modules import each other by top-level name
      env: { ...process.env, HERMES_HOME: home, PYTHONPATH: CORE_DIR, AECPILOT_INVENTORY_OUT: dump },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    });
    if (result.status !== 0 || !fs.existsSync(dump)) {
      throw new Error(
        `reading the gateway registry failed (status ${result.status}):\n${(result.stderr || result.stdout).slice(-3000)}`,
      );
    }
    return JSON.parse(read(dump));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
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

/** DEFAULT_CONFIG and the dependency pins, read out of the core by the core's
 * own Python. Parsing a 3000-line dict literal with a regex would be guesswork;
 * importing it is exact, and the venv has to work for the snapshot to mean
 * anything anyway. Keys are flattened to dotted paths so a diff can name the
 * one that moved. The pins come from the TREE's pyproject.toml, not from
 * importlib.metadata: under `--core` the metadata belongs to the installed
 * version, so the 0.21.3 worktree snapshot silently carried 0.21.2's list and
 * missed the new `pillow-heif` (measured, task 3.B5). Rendered through
 * packaging.Requirement so both modes print the same string per pin. */
function coreConfigAndDeps() {
  const script = `
import json, os, tomllib
from packaging.requirements import Requirement
from hermes_cli import config_defaults

def pins():
    with open(os.path.join(os.getcwd(), "pyproject.toml"), "rb") as fh:
        project = tomllib.load(fh)["project"]
    out = [str(Requirement(dep)) for dep in project.get("dependencies", [])]
    for extra, deps in project.get("optional-dependencies", {}).items():
        for dep in deps:
            req = Requirement(dep)
            # A dep that already carries a marker (platform_system == ...) joins it with
            # the extra marker the way the wheel metadata does.
            marker = f'({req.marker}) and extra == "{extra}"' if req.marker else f'extra == "{extra}"'
            out.append(str(Requirement(f"{str(req).split(';')[0].strip()}; {marker}")))
    return sorted(out)

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
    "requiresDist": pins(),
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

// `ourEvents` used to live here: the two lists our own chat reducer kept in
// `renderer/src/chat/chat-state.ts`, telling which gateway events we handled and
// which we deliberately ignored. That file was deleted in 1.8.9 («delete the UI
// their application replaced») — we took the donor's chat, and their code
// dispatches events inline instead of declaring a list. So the question «which
// events does OUR chat handle» no longer has an answer on our side, and the
// section was reading a path that had not existed for weeks. Found by task 3.B0,
// the first run of this tool since the migration; `contract-diff` never compared
// the section, so nothing downstream loses a check. The question it used to
// answer is now the parity registry's (AC9, `runtime/parity-registry.mjs`),
// whose unit is a screen rather than an event name.
// Snapshot format bumped 2 → 3 by that removal.

// ------------------------------------------------------------------------ main

function main() {
  const sources = gatewaySources();
  const allMethods = gatewayMethodsLive();
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
  // `_emit("x", …)` is the common shape; 0.21.2 also routes the side-agent
  // completions through `_spawn_side_agent(rid, session, task_id, parent, "btw.complete", …)`,
  // where the name is the first dotted literal among the arguments. Reading
  // only `_emit(` reported those three events as gone while our BTW surface was
  // still receiving them — so both shapes are read.
  const emitted = new Set([...allText.matchAll(/_emit\(\s*"([a-z_.]+)"/g)].map((m) => m[1]));
  for (const call of allText.matchAll(/_spawn_side_agent\(([^()]{0,300})/g)) {
    const literal = call[1].match(/"([a-z_]+\.[a-z_.]+)"/);
    if (literal) emitted.add(literal[1]);
  }
  const emittedList = [...emitted].sort();

  const checkpointManager = readIfPresent(path.join(CORE_DIR, "tools", "checkpoint_manager.py"));
  // a local `markers = {…}` until 0.21.0, a module constant `_PROJECT_MARKERS = {…}` since 0.21.2
  const markerBlock = checkpointManager.match(/(?:_PROJECT_MARKERS|markers) = \{([^}]*)\}/);
  const markers = markerBlock
    ? [...markerBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()
    : [];

  const snapshot = {
    snapshotFormat: SNAPSHOT_FORMAT,
    hermesVersion: VERSION_LABEL,
    hermesSha: SHA_LABEL,
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
    gatewayEmittedEvents: emittedList,
    coreRestRoutes: restRoutes,
    configDefaults,
    requiresDist,
    checkpointMarkers: markers,
    ourMethods: ourMethodView,
    ourRestRoutes: ourRouteView,
  };

  if (process.argv.includes("--print")) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, `hermes-${VERSION_LABEL}.json`);
  fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

  const missing = Object.entries(ourMethodView).filter(([, v]) => v.hash === null);
  const missingRoutes = Object.entries(ourRouteView).filter(([, present]) => !present);
  const withDefaults = Object.values(allMethods).filter((m) => Object.keys(m.defaults).length > 0);
  console.log(`слепок ядра ${VERSION_LABEL} (${SHA_LABEL.slice(0, 12)}) → ${path.relative(REPO_DIR, out)}`);
  console.log(`  ядро: методов ${Object.keys(allMethods).length} в ${snapshot.gatewayModules.length} модулях, ` +
    `маршрутов ${Object.keys(restRoutes).length}, дефолтов конфига ${Object.keys(configDefaults).length}`);
  console.log(`  умолчания параметров записаны у ${withDefaults.length} методов`);
  console.log(`  наша поверхность: методов ${Object.keys(ourMethodView).length}, маршрутов ${Object.keys(ourRouteView).length}`);
  console.log(`  ядро эмитит событий: ${emittedList.length}, маркеров чекпойнтов: ${markers.length}`);
  if (missing.length > 0) {
    console.log(`  ВНИМАНИЕ, метод не найден в ядре: ${missing.map(([k]) => k).join(", ")}`);
  }
  if (missingRoutes.length > 0) {
    console.log(`  ВНИМАНИЕ, маршрут не найден: ${missingRoutes.map(([k]) => k).join(", ")}`);
  }
}

main();
