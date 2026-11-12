// Task T62 (UR51): a Revit MCP server through the core's own MCP client — connect, read,
// and the person's question before every write. The server is `fixtures/revit-mcp-stub.py`
// (the shape of a Revit server without Revit); the checks are in `revit-mcp-probe.py`.
//
// Free: no model, no network. Writes `mcp_servers` into the profile it is given — run it
// on a temporary copy only.
//
// Usage: AEC_HERMES_HOME=<temporary profile copy> node runtime/revit-mcp-probe.mjs
// Exit codes: 0 = all checks passed; 1 = a check failed; 3 = could not run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PYTHON_ARGS, PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";

const home = process.env.AEC_HERMES_HOME;
if (!home || path.resolve(home) === path.resolve(RUNTIME_DIR, "dev-profile")) {
  console.error("revit-mcp-probe: set AEC_HERMES_HOME to a temporary profile copy");
  process.exit(3);
}

const SERVER = path.join(RUNTIME_DIR, "fixtures", "revit-mcp-stub.py");

/** Two copies of the stub under `mcp_servers`: `revit` as UR51 wants it (untrusted) and
 *  `revit_plain` as the MCP window writes it today (no `trust`). Text merge, same reason as
 *  the register-* scripts. */
function addStubServers(configPath) {
  const quoted = (value) => JSON.stringify(value);
  const command = [
    `    command: ${quoted(PYTHON_BIN)}`,
    `    args: [${[...PYTHON_ARGS, SERVER, "stdio"].map(quoted).join(", ")}]`,
  ];
  const entries = ["  revit:", ...command, "    trust: untrusted", "  revit_plain:", ...command];
  let text = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf-8") : "";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^mcp_servers:\s*(#.*)?$/.test(line));
  if (start === -1) {
    text = `${text.replace(/\s*$/, "\n")}mcp_servers:\n${entries.join("\n")}\n`;
  } else {
    lines.splice(start + 1, 0, ...entries);
    text = lines.join("\n");
  }
  fs.writeFileSync(configPath, text, "utf-8");
}

addStubServers(path.join(home, "config.yaml"));
const run = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, path.join(RUNTIME_DIR, "revit-mcp-probe.py")], {
  encoding: "utf-8",
  env: { ...process.env, HERMES_HOME: path.resolve(home), PYTHONIOENCODING: "utf-8" },
  timeout: 240_000,
  windowsHide: true,
});
process.stdout.write(run.stdout ?? "");
if (run.status !== 0) process.stderr.write((run.stderr ?? "").split("\n").slice(-30).join("\n"));
process.exit(run.status === 0 ? 0 : run.status === 1 ? 1 : 3);
