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
  HERMES_VERSION,
  PYTHON_VERSION,
  VENV_DIR,
} from "./hermes-env.mjs";

function run(command, args) {
  console.log(`+ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
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

console.log(`== 1/3: creating isolated venv at ${VENV_DIR}`);
run("uv", [
  "venv",
  VENV_DIR,
  "--python",
  PYTHON_VERSION,
  "--allow-existing", // idempotent: keep re-running without clearing/erroring
]);

console.log(`== 2/3: installing hermes-agent[mcp]==${HERMES_VERSION} (pinned)`);
// The `mcp` extra (task 1.12) pulls in hermes's pinned mcp==1.26.0 +
// starlette==1.0.1 — required for hermes to act as an MCP *client* (connect
// to stdio/HTTP MCP servers like mcp/aec_sources) via tools/mcp_tool.py.
// Without it, tools.mcp_tool._MCP_AVAILABLE is False and no MCP server can
// ever connect, regardless of what's registered in config.yaml.
run("uv", [
  "pip",
  "install",
  "--python",
  VENV_DIR,
  `hermes-agent[mcp]==${HERMES_VERSION}`,
]);

console.log(`== 3/3: preparing isolated HERMES_HOME at ${HERMES_HOME_DIR}`);
fs.mkdirSync(HERMES_HOME_DIR, { recursive: true });

console.log("\nDone.");
console.log(`HERMES_BIN=${HERMES_BIN}`);
console.log(`HERMES_HOME=${HERMES_HOME_DIR}`);
