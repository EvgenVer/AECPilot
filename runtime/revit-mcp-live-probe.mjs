// Tasks T67/T68 (UR51): the real Autodesk Revit MCP server through the core's own MCP client.
// Revit 2027 must be running with a model open. The checks are in `revit-mcp-live-probe.py`
// (modes `read` and `steps` — see its docstring; write steps touch the open model and are
// for a document the owner named for it only).
//
// Free: no model, no network. Writes `mcp_servers` into the profile it is given — run it
// on a temporary copy only.
//
// Usage: AEC_HERMES_HOME=<temporary profile copy> [REVIT_PROBE_TRUST=untrusted|none]
//        [REVIT_PROBE_MODE=read|steps] [REVIT_PROBE_STEPS='[{"tool":…,"args":{…},"answer":…}]']
//        [REVIT_PID=<Revit process id>]
//        [REVIT_MCP_EXE=<path to Autodesk.RevitMcpServer.Stdio.exe>]
//        node runtime/revit-mcp-live-probe.mjs
// Exit codes: 0 = Revit's tools arrived; 1 = they did not; 3 = could not run.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PYTHON_ARGS, PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";

const home = process.env.AEC_HERMES_HOME;
if (!home || path.resolve(home) === path.resolve(RUNTIME_DIR, "dev-profile")) {
  console.error("revit-mcp-live-probe: set AEC_HERMES_HOME to a temporary profile copy");
  process.exit(3);
}

const EXE =
  process.env.REVIT_MCP_EXE ??
  "C:\\Program Files\\Autodesk\\Revit 2027 MCP Server Experimental-Tools Technical Preview\\Autodesk.RevitMcpServer.Stdio.exe";
if (!fs.existsSync(EXE)) {
  console.error(`revit-mcp-live-probe: no Revit MCP server at ${EXE}`);
  process.exit(3);
}

/** One server `revit`, the way the MCP window writes it (`command` only) plus `trust` when
 *  asked. Text merge, same reason as the register-* scripts. */
function addServer(configPath) {
  const trust = process.env.REVIT_PROBE_TRUST ?? "untrusted";
  const entries = ["  revit:", `    command: ${JSON.stringify(EXE)}`];
  if (trust !== "none") entries.push(`    trust: ${trust}`);
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

addServer(path.join(home, "config.yaml"));
const run = spawnSync(
  PYTHON_BIN,
  [...PYTHON_ARGS, path.join(RUNTIME_DIR, "revit-mcp-live-probe.py")],
  {
    encoding: "utf-8",
    env: { ...process.env, HERMES_HOME: path.resolve(home), PYTHONIOENCODING: "utf-8" },
    timeout: 240_000,
    windowsHide: true,
  },
);
process.stdout.write(run.stdout ?? "");
if (run.status !== 0) process.stderr.write((run.stderr ?? "").split("\n").slice(-30).join("\n"));
process.exit(run.status === 0 ? 0 : run.status === 1 ? 1 : 3);
