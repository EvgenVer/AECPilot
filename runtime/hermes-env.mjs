// Resolves the isolated hermes-agent runtime paths used by setup.mjs and by
// task 0.7 (launching `hermes serve`). Pure path/constant module — no side effects.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));

// Pins — must match PLAN.md § Stack & package managers.
// 0.22.0 made Python 3.14 mandatory: every core dependency carries the marker
// `python_version >= '3.14'` and `[tool.uv] environments` is >=3.14 — on 3.12 the
// core installs with no dependencies at all. Owner permission 2026-10-15 (task T20.3).
export const HERMES_VERSION = "0.22.2";
export const PYTHON_VERSION = "3.14.6";

// The core is installed from git, not from PyPI: the author stopped publishing
// wheels (PLAN.md, decision D1). A git tag can be moved; a commit id cannot, so
// the pin is the commit — the tag is only how we found it and how we re-check it.
//
// `git ls-remote --tags <repo>` on 2026-09-01 gave, for release 0.21.0:
//   6e8f8418e6378eb2617e4de074e13dedd091b8af  refs/tags/v2026.8.31     (tag object)
//   29112bef099274229cadff79cdff7bf7b99c4b77  refs/tags/v2026.8.31^{}  (the commit)
// It is an annotated tag, so the commit is the `^{}` line — the first line is the
// tag object itself and installing from it would fail.
//
// The tag name does not carry the version: `v2026.8.16` is 0.20.2 and
// `v2026.8.16.2` is 0.20.3. The version is read from `pyproject.toml` at the
// tagged commit, and it read `0.21.0` here — the release that was waited for
// through August finally exists, and the release commit says so in one line
// (`chore: release v0.21.0 (2026.8.31)`). The curated notes promised "with
// 0.21.0" never arrived, so the tree stays the only source. Rule (PLAN §Слой
// донора) is unchanged and is what got us here: the pin goes to the LAST
// AVAILABLE TAG, never to an expected release number.
//
// 0.22.0 changed the release scheme (task T20, 2026-10-15): stable releases are
// `vX.Y.Z`, next to them stand `rc.N-vX.Y.Z`, `abandoned-rc.*` and daily
// `vX.Y.Z+canary.<date>`. The pin goes to the last STABLE `vX.Y.Z` only (owner
// decision 2026-10-15). The version also left the tree: `pyproject.toml` reads
// `0.0.0` and `hermes_cli.__version__` comes from `install-stamp.json`, which an
// editable install does not write — so the tag name is now the version record.
// 0.22.1 was cut from the wrong commit (upstream calls 0.22.2 "what 0.22.1 should
// have been") and is skipped. `git ls-remote --tags` on 2026-10-15:
//   7b77e29eedd85a8497ce2821448dac7964dc46f6  refs/tags/v0.22.2     (tag object)
//   d923a5eb487a17c0a68801bba9ef0f56c81040a8  refs/tags/v0.22.2^{}  (the commit)
//
// Previous pins:
//   v2026.8.3  = 0.20.0, commit 3c27eb6234bf91b8ceee9e9071591b31e9b148cb
//   v2026.8.18 = 0.20.4, commit e624e9fde561e1add9388384012b295fde669ade (task 3.B0)
//   v2026.8.19 = 0.20.5, commit fcbd1076a93841fa88855acce810e342a5b78101 (task 3.B1)
//   v2026.8.27 = 0.20.6, commit 5fc308a70719a83cccdbba4c0e39c23f5a8239d5 (task 3.B2)
//   v2026.8.31 = 0.21.0, commit 29112bef099274229cadff79cdff7bf7b99c4b77 (task 3.B3)
//   v2026.9.11 = 0.21.2, commit 939e45c91d751fadd94dcd1b873ac3cb44846213 (task 3.B4)
//   v2026.9.24 = 0.21.5, commit f97608f178d1ffeca59860195ab7da295f7c8e5f (task 3.B6),
//                Python 3.12.13
export const HERMES_REPO = "https://github.com/NousResearch/hermes-agent";
export const HERMES_TAG = "v0.22.2";
export const HERMES_SHA = "d923a5eb487a17c0a68801bba9ef0f56c81040a8";

// Mem0 left the core in 0.22.0: `plugins/memory/mem0` and the `mem0` extra are gone,
// the provider is the catalog plugin `mem0ai/mem0`, subdirectory below, at the pin
// their catalog reviewed. Left alone, the core installs it by itself from GitHub on
// agent start (`hermes_cli/memory_provider_migration.py`) — so we install it
// ourselves, by commit, like the core (owner decision 2026-10-15, task T20.3).
// It is a directory plugin (no build system, no entry point): the core finds it only
// under `$HERMES_HOME/plugins/mem0/`, so setup fetches it here and the app copies it
// into the profile; its Python requirements go into the core venv
// (`mem0-plugin-requirements.txt`, one resolution with the core).
export const MEM0_PLUGIN_REPO = "https://github.com/mem0ai/mem0";
export const MEM0_PLUGIN_SHA = "43849c6e9d4d773b83a8144b6373aedc67241a5d";
export const MEM0_PLUGIN_SUBDIR = "integrations/hermes-plugin-mem0";
export const MEM0_PLUGIN_VERSION = "1.3.0";

/**
 * Two layouts, one set of names (tasks T21, T40; SPEC UR40).
 *
 * - **Development** — this repository: the core in `runtime/.hermes-venv` +
 *   `runtime/.hermes-src` (setup.mjs), our MCP servers in `<repo>/.venv`, the
 *   profile in `runtime/dev-profile`.
 * - **Installed** — the folder the person chose in the installer (`<root>`):
 *   `runtime/` (this file and its neighbours) sits at `<root>/runtime/`, next to it
 *   the core payload `runtime/core/` (staged by `runtime/payload/stage_core.py`,
 *   their PM's contained layout with `manifest.json`) and our Python
 *   `runtime/mcp/python/` (`runtime/payload/stage-mcp.mjs`); everything the product
 *   writes lives under `<root>/data/` — the profile is `<root>/data/profile`.
 *
 * The layout is read off the disk, not passed in: the core payload's manifest is
 * the proof of an installed tree, and a development checkout never has one there
 * (staging goes to `runtime/.payload/`).
 */
export const INSTALL_ROOT = path.resolve(RUNTIME_DIR, "..");
export const CORE_PAYLOAD_DIR = path.join(RUNTIME_DIR, "core");
export const MCP_PAYLOAD_DIR = path.join(RUNTIME_DIR, "mcp");
export const DATA_DIR = path.join(INSTALL_ROOT, "data");

/** The launch contract their assembler wrote (`scripts/build/agent.py::assemble`):
 *  relative paths of the interpreter, the source tree, the dependency site and the
 *  launchers. `null` outside an installed tree. */
export function readCoreManifest(dir = CORE_PAYLOAD_DIR) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"));
    return manifest && manifest.runtime ? manifest : null;
  } catch {
    return null;
  }
}

const coreManifest = readCoreManifest();
export const IS_INSTALLED_LAYOUT = coreManifest !== null;

// Isolated venv: keeps hermes-agent and its deps out of the repo's root
// uv workspace (mcp/*) and out of any user-level Python install.
// Installed: the payload's dependency environment.
export const VENV_DIR = IS_INSTALLED_LAYOUT
  ? path.join(CORE_PAYLOAD_DIR, coreManifest.venv)
  : path.join(RUNTIME_DIR, ".hermes-venv");

// Source checkout of the core at HERMES_SHA. It exists because upstream's build
// backend refuses to build a wheel or sdist at all ("Hermes is distributed via
// the shell installer, Docker image, or Nix") and offers only an editable
// install — so the install is `-e <this dir>` and this dir must stay put for the
// venv to keep working. Not a working copy: detached at the pinned commit, never
// edited, gitignored. Installed: the payload's snapshot of the same commit.
export const HERMES_SRC_DIR = IS_INSTALLED_LAYOUT
  ? path.join(CORE_PAYLOAD_DIR, coreManifest.runtime.repoDir)
  : path.join(RUNTIME_DIR, ".hermes-src");

// Sparse checkout of the Mem0 plugin repository at MEM0_PLUGIN_SHA — only
// MEM0_PLUGIN_SUBDIR is populated. Detached, never edited, gitignored.
export const MEM0_PLUGIN_CHECKOUT_DIR = path.join(RUNTIME_DIR, ".mem0-plugin-src");
export const MEM0_PLUGIN_DIR = path.join(MEM0_PLUGIN_CHECKOUT_DIR, ...MEM0_PLUGIN_SUBDIR.split("/"));

// Isolated HERMES_HOME: keeps the dev profile out of the user's home
// directory, so it never touches an existing personal Hermes install/profile.
// `AEC_HERMES_HOME` (task 3F.1) points the whole stack — the app's main process
// and `serve.mjs` alike — at another profile: the acceptance run copies
// dev-profile into a temporary folder and lets the app own its own core there,
// exactly as it does for a person. Unset in normal use.
// Installed (UR40): the profile lives under the install root, never in the
// person's home — `<root>/data/profile`.
export const HERMES_HOME_DIR = process.env.AEC_HERMES_HOME
  ? path.resolve(process.env.AEC_HERMES_HOME)
  : IS_INSTALLED_LAYOUT
    ? path.join(DATA_DIR, "profile")
    : path.join(RUNTIME_DIR, "dev-profile");

// POSIX branch untested in Phase 0 (dev target = Windows)
const isWindows = process.platform === "win32";

/** A path of the payload's manifest made absolute (`.exe` is already part of it). */
function payloadPath(relative) {
  return path.join(CORE_PAYLOAD_DIR, ...relative.split("/"));
}

export const HERMES_BIN = IS_INSTALLED_LAYOUT
  ? payloadPath(coreManifest.runtime.commands.hermes)
  : isWindows
    ? path.join(VENV_DIR, "Scripts", "hermes.exe")
    : path.join(VENV_DIR, "bin", "hermes");

/** The core's interpreter. Installed, it is the payload's own CPython; their launchers
 *  put the source tree and the dependency site on `sys.path` (PYTHONPATH below), and
 *  so must every script of ours that imports the core or mem0 (`memory-facts.py`). */
export const PYTHON_BIN = IS_INSTALLED_LAYOUT
  ? payloadPath(coreManifest.runtime.storePython)
  : isWindows
    ? path.join(VENV_DIR, "Scripts", "python.exe")
    : path.join(VENV_DIR, "bin", "python");

/** Arguments that go between {@link PYTHON_BIN} and a script (or `-c`) of ours that
 *  imports the core or mem0. Installed: `bin/core_python.py` puts the payload's source
 *  tree and dependency site on `sys.path` the way their launchers do and drops an
 *  inherited `PYTHONPATH`; `-s` keeps the person's user site out. Not `-E`: it would
 *  also drop the `PYTHONIOENCODING` our callers set. Development: none. */
export const PYTHON_ARGS = IS_INSTALLED_LAYOUT
  ? ["-s", path.join(RUNTIME_DIR, "bin", "core_python.py")]
  : [];

/** Our Python for the MCP servers (3.12, Docling/LightRAG). Installed: the staged
 *  standalone interpreter; development: the uv workspace's `.venv`. */
export const MCP_PYTHON_BIN = mcpPython(IS_INSTALLED_LAYOUT);

function mcpPython(installed) {
  return installed
    ? path.join(MCP_PAYLOAD_DIR, "python", isWindows ? "python.exe" : "bin/python3")
    : path.join(INSTALL_ROOT, ".venv", isWindows ? "Scripts/python.exe" : "bin/python");
}

/**
 * How to start one of our MCP servers (`aec-sources`, `aec-rag`, `aec-roster`).
 * Development: the workspace's console script. Installed: `python -m <module>` with
 * the staged interpreter — a console-script exe carries the build machine's absolute
 * path to its python, the module form carries nothing (task T22). `-s`: the person's
 * user site cannot leak into ours; their environment does not reach the server at all —
 * the core starts MCP children with a filtered one (`tools/mcp_tool._build_safe_env`).
 */
export function mcpServerCommand(name, installed = IS_INSTALLED_LAYOUT) {
  if (installed) {
    return { command: mcpPython(true), args: ["-s", "-m", name.replaceAll("-", "_")] };
  }
  return {
    command: isWindows
      ? path.join(INSTALL_ROOT, ".venv", "Scripts", `${name}.exe`)
      : path.join(INSTALL_ROOT, ".venv", "bin", name),
    args: [],
  };
}

/** Task 3G.18 (D-141). A folder holding only OUR `hermes` (`hermes` for the core's
 *  bash terminal, `hermes.cmd` for Windows lookups) — not the venv's Scripts, which
 *  would also put our `python` ahead of the person's in the agent's terminal. */
export const AEC_BIN_DIR = path.join(RUNTIME_DIR, "bin");

/**
 * `env` with {@link AEC_BIN_DIR} first on PATH. The core finds `hermes` for its
 * child processes by `shutil.which("hermes")` and prepends that folder to the
 * terminal's PATH (`tools/environments/local.py::_resolve_hermes_bin_dir`); with a
 * foreign install on PATH (D-141: `%LOCALAPPDATA%\hermes\bin`, another version, no
 * keys) the donor's `hermes -p <bot> chat …` ran THAT one. Windows keeps the key as
 * `Path`, so the existing spelling is reused.
 *
 * The core itself, at every start on Windows, PREPENDS the folders of a standard
 * Hermes install (`hermes_cli/stdio.py::_augment_path_with_known_tools`), among them
 * `%LOCALAPPDATA%\hermes\hermes-agent\venv\Scripts` with a foreign `hermes.exe` —
 * but only those not on PATH yet (measured 30.09.2026: a routine ran the owner's
 * separate install). So the ones that exist go to the END here: already present,
 * they stay behind ours.
 */
export function withOurHermesOnPath(env, isDir = isDirectory) {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  const rest = (env[key] ?? "")
    .split(path.delimiter)
    .filter((entry) => entry && path.resolve(entry) !== path.resolve(AEC_BIN_DIR));
  const listed = new Set(rest.map((entry) => entry.toLowerCase()));
  const behind = coreKnownToolDirs(env).filter(
    (dir) => isDir(dir) && !listed.has(dir.toLowerCase()),
  );
  return { ...env, [key]: [AEC_BIN_DIR, ...rest, ...behind].join(path.delimiter) };
}

/**
 * D-164 (owner decision 2026-09-30). The core keeps «one gateway per OS user» through a
 * lock dir shared by every Hermes on the machine (`gateway/status.py::_get_lock_dir`,
 * default `~/.local/state/hermes/…`): with a separate Hermes gateway running, our cron
 * runner said «already serves» and exited, and routines stopped silently. Our core
 * processes get their own dir inside the profile — `HERMES_GATEWAY_LOCK_DIR`, the core's
 * own override. Every process of ours must agree on it: serve and the cron runner.
 */
export function gatewayLockDir(homeDir) {
  return path.join(homeDir, "gateway-locks");
}

/** The list of `_augment_path_with_known_tools` in the pinned core, same order. */
function coreKnownToolDirs(env) {
  const localAppData = env.LOCALAPPDATA;
  if (!localAppData) return [];
  return [
    path.join(localAppData, "hermes", "git", "cmd"),
    path.join(localAppData, "hermes", "git", "bin"),
    path.join(localAppData, "hermes", "git", "usr", "bin"),
    path.join(localAppData, "hermes", "hermes-agent", "venv", "Scripts"),
    path.join(localAppData, "Microsoft", "WinGet", "Links"),
  ];
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  // Printed for humans / shells that want to `eval` the exports.
  console.log(`HERMES_VERSION=${HERMES_VERSION}`);
  console.log(`HERMES_SHA=${HERMES_SHA}`);
  console.log(`PYTHON_VERSION=${PYTHON_VERSION}`);
  console.log(`VENV_DIR=${VENV_DIR}`);
  console.log(`HERMES_HOME_DIR=${HERMES_HOME_DIR}`);
  console.log(`HERMES_BIN=${HERMES_BIN}`);
  console.log(`PYTHON_BIN=${PYTHON_BIN}`);
}
