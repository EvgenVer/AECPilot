// Installs a pinned hermes-agent into an isolated venv under runtime/, and
// prepares an isolated HERMES_HOME dev profile — both outside the repo's
// root uv workspace and outside any user-level Hermes install/profile.
//
// Usage: node runtime/setup.mjs
// Idempotent: safe to re-run; re-installs the same pinned version in place.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  HERMES_BIN,
  HERMES_HOME_DIR,
  HERMES_REPO,
  HERMES_SHA,
  HERMES_SRC_DIR,
  HERMES_VERSION,
  PYTHON_VERSION,
  RUNTIME_DIR,
  VENV_DIR,
} from "./hermes-env.mjs";

function run(command, args, cwd) {
  console.log(`+ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", cwd });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(
        "'uv' not found in PATH — install uv (see PLAN.md § Stack) and re-run",
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

/** The core now comes from git (PLAN.md, decision D1), so git is a build
 * prerequisite. uv shells out to it and reports the miss as a build-backend
 * failure buried in a wall of output; say it plainly first instead. */
function requireGit() {
  const probe = spawnSync("git", ["--version"], { stdio: "pipe" });
  if (probe.error?.code === "ENOENT" || probe.status !== 0) {
    throw new Error(
      "'git' not found in PATH — hermes-agent is installed from its git " +
        "repository (PyPI publication was discontinued upstream), so git is " +
        "required. Install git, reopen the shell, and re-run.",
    );
  }
}

/** HEAD of the source checkout, or null if there is no checkout yet. */
function headSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: HERMES_SRC_DIR,
    stdio: "pipe",
    encoding: "utf-8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Fetches exactly the pinned commit — depth 1, no tags, no branches. A moved
 * tag cannot reach us: the commit id is what is asked for and what is checked. */
function fetchCore() {
  fs.mkdirSync(HERMES_SRC_DIR, { recursive: true });
  if (!fs.existsSync(`${HERMES_SRC_DIR}/.git`)) {
    run("git", ["init", "--quiet"], HERMES_SRC_DIR);
    run("git", ["remote", "add", "origin", HERMES_REPO], HERMES_SRC_DIR);
  }
  // Their `website/i18n/zh-Hans/**` paths pass 260 characters; without this,
  // checkout on Windows fails file by file and leaves a half-populated tree.
  run("git", ["config", "core.longpaths", "true"], HERMES_SRC_DIR);

  if (headSha() === HERMES_SHA) {
    console.log(`   already at ${HERMES_SHA} — skipping fetch`);
    return;
  }
  run("git", ["fetch", "--depth", "1", "--no-tags", "origin", HERMES_SHA], HERMES_SRC_DIR);
  run("git", ["checkout", "--detach", "--force", HERMES_SHA], HERMES_SRC_DIR);

  const head = headSha();
  if (head !== HERMES_SHA) {
    throw new Error(`checkout landed on ${head}, expected ${HERMES_SHA}`);
  }
}

console.log(`== 1/4: creating isolated venv at ${VENV_DIR}`);
run("uv", [
  "venv",
  VENV_DIR,
  "--python",
  PYTHON_VERSION,
  "--allow-existing", // idempotent: keep re-running without clearing/erroring
]);

console.log(`== 2/4: fetching hermes-agent source at ${HERMES_SHA.slice(0, 12)}`);
// Pinned to a commit id, never to the tag: the author dropped PyPI and Homebrew,
// and a tag can be moved after the fact. See hermes-env.mjs for how the commit
// was resolved from tag v2026.8.3.
requireGit();
fetchCore();

console.log(`== 3/4: installing hermes-agent[mcp,mem0] ${HERMES_VERSION} (editable)`);
// Editable is not a preference — upstream's build backend raises on any wheel or
// sdist build ("Hermes is distributed via the shell installer, Docker image, or
// Nix"; setup.py) and names `uv pip install -e .` as the developer path. So the
// venv keeps a link to HERMES_SRC_DIR instead of a copy, and that directory is
// part of the installation.
//
// The `mcp` extra pulls in hermes's pinned mcp==1.28.1 + starlette==1.3.1
// (patched for CVE-2026-48710) — required for hermes to act as an MCP *client*
// (connect to stdio/HTTP MCP servers like mcp/aec_sources) via
// tools/mcp_tool.py. Without it, tools.mcp_tool._MCP_AVAILABLE is False and no
// MCP server can ever connect, regardless of what's registered in config.yaml.
//
// The `mem0` extra is the SECOND layer of agent memory (задача 5.1, решение
// владельца 2026-08-31 — вариант A, «го» на установку 2026-09-08). Оно идёт
// именно в venv ЯДРА, потому что провайдер памяти — это реализация их ABC
// `agent/memory_provider.py`, которую ядро поднимает у себя; в нашем корневом
// `.venv` ему делать нечего. Замерено `--dry-run` против этого venv: 12 новых
// пакетов, 21 МБ колёсами, ничего не понижается, OCR-конвейер в корневом venv
// не затрагивается вовсе (numpy и protobuf приезжают сюда впервые).
//
// `--override`: the core's base dependency list is taken as-is with one
// exception, `pillow-heif` (0.21.3, task 3.B5е). Its Windows wheel bundles
// libx265 under GPLv2 and declares the wheel itself GPLv2 — excluded by SPEC
// N8/C3 (owner decision 2026-09-15). The core imports it inside a try/except
// (`tools/vision_tools_image_prep.py`, `agent/image_routing.py`): without it
// HEIC/HEIF photos are rejected with an actionable error, AVIF is decoded by
// Pillow itself. The override file carries a marker that is never true, which
// removes the requirement from the resolution instead of pinning it.
// The file is named relative to RUNTIME_DIR (and the command runs there):
// uv 0.12.1 splits the `--override` value at whitespace, so an absolute path
// under `D:\my program\…` is read as `D:\my` (measured, task 3.B5).
run(
  "uv",
  [
    "pip",
    "install",
    "--python",
    VENV_DIR,
    "--override",
    "uv-overrides.txt",
    "-e",
    `${HERMES_SRC_DIR}[mcp,mem0]`,
  ],
  RUNTIME_DIR,
);

console.log(`== 4/4: preparing isolated HERMES_HOME at ${HERMES_HOME_DIR}`);
fs.mkdirSync(HERMES_HOME_DIR, { recursive: true });

console.log("\nDone.");
console.log(`HERMES_BIN=${HERMES_BIN}`);
console.log(`HERMES_HOME=${HERMES_HOME_DIR}`);
