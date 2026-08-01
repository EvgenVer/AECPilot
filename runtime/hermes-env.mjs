// Resolves the isolated hermes-agent runtime paths used by setup.mjs and by
// task 0.7 (launching `hermes serve`). Pure path/constant module — no side effects.

import { fileURLToPath } from "node:url";
import path from "node:path";

export const RUNTIME_DIR = path.dirname(fileURLToPath(import.meta.url));

// Pins — must match PLAN.md § Stack & package managers.
export const HERMES_VERSION = "0.19.0";
export const PYTHON_VERSION = "3.12.13";

// Isolated venv: keeps hermes-agent and its deps out of the repo's root
// uv workspace (mcp/*) and out of any user-level Python install.
export const VENV_DIR = path.join(RUNTIME_DIR, ".hermes-venv");

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
  console.log(`PYTHON_VERSION=${PYTHON_VERSION}`);
  console.log(`VENV_DIR=${VENV_DIR}`);
  console.log(`HERMES_HOME_DIR=${HERMES_HOME_DIR}`);
  console.log(`HERMES_BIN=${HERMES_BIN}`);
  console.log(`PYTHON_BIN=${PYTHON_BIN}`);
}
