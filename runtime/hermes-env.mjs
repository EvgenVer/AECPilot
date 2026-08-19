// Resolves the isolated hermes-agent runtime paths used by setup.mjs and by
// task 0.7 (launching `hermes serve`). Pure path/constant module — no side effects.

import { fileURLToPath } from "node:url";
import path from "node:path";

export const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));

// Pins — must match PLAN.md § Stack & package managers.
export const HERMES_VERSION = "0.20.4";
export const PYTHON_VERSION = "3.12.13";

// The core is installed from git, not from PyPI: the author stopped publishing
// wheels (PLAN.md, decision D1). A git tag can be moved; a commit id cannot, so
// the pin is the commit — the tag is only how we found it and how we re-check it.
//
// `git ls-remote --tags <repo>` on 2026-08-19 gave, for release 0.20.4:
//   9f13bbbf8423427e159c78066356ca0e27ca6b74  refs/tags/v2026.8.18     (tag object)
//   e624e9fde561e1add9388384012b295fde669ade  refs/tags/v2026.8.18^{}  (the commit)
// It is an annotated tag, so the commit is the `^{}` line — the first line is the
// tag object itself and installing from it would fail.
//
// The tag name does not carry the version: `v2026.8.16` is 0.20.2 and
// `v2026.8.16.2` is 0.20.3. The version is read from `pyproject.toml` at the
// tagged commit, and it read `0.20.4` here. Rule (PLAN §Слой донора): the pin
// goes to the LAST AVAILABLE TAG, never to an expected release number — 0.21.0
// was waited for and does not exist.
//
// Previous pin, raised 2026-08-19 by task 3.B0:
//   v2026.8.3 = 0.20.0, commit 3c27eb6234bf91b8ceee9e9071591b31e9b148cb
export const HERMES_REPO = "https://github.com/NousResearch/hermes-agent";
export const HERMES_TAG = "v2026.8.18";
export const HERMES_SHA = "e624e9fde561e1add9388384012b295fde669ade";

// Isolated venv: keeps hermes-agent and its deps out of the repo's root
// uv workspace (mcp/*) and out of any user-level Python install.
export const VENV_DIR = path.join(RUNTIME_DIR, ".hermes-venv");

// Source checkout of the core at HERMES_SHA. It exists because upstream's build
// backend refuses to build a wheel or sdist at all ("Hermes is distributed via
// the shell installer, Docker image, or Nix") and offers only an editable
// install — so the install is `-e <this dir>` and this dir must stay put for the
// venv to keep working. Not a working copy: detached at the pinned commit, never
// edited, gitignored.
export const HERMES_SRC_DIR = path.join(RUNTIME_DIR, ".hermes-src");

// Isolated HERMES_HOME: keeps the dev profile out of the user's home
// directory, so it never touches an existing personal Hermes install/profile.
export const HERMES_HOME_DIR = path.join(RUNTIME_DIR, "dev-profile");

// POSIX branch untested in Phase 0 (dev target = Windows)
const isWindows = process.platform === "win32";

export const HERMES_BIN = isWindows
  ? path.join(VENV_DIR, "Scripts", "hermes.exe")
  : path.join(VENV_DIR, "bin", "hermes");

export const PYTHON_BIN = isWindows
  ? path.join(VENV_DIR, "Scripts", "python.exe")
  : path.join(VENV_DIR, "bin", "python");

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
