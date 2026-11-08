// What core 0.23 adds for MCP, measured through the core's own MCP client (task T55):
// stdio and Streamable HTTP, live progress (`tool.progress`), the approval question of a
// write tool on an untrusted server with its arguments, the declared cost and the
// per-chat spend limit. The servers are `fixtures/mcp-probe-server.py` (the shape of a
// Revit or Lira Support server, without the design tool).
//
// Free: no model, no network beyond 127.0.0.1. Writes `mcp_servers` into the profile it
// is given — run it on a temporary copy only.
//
// Usage: AEC_HERMES_HOME=<temporary profile copy> node runtime/mcp-features-probe.mjs
// Exit codes: 0 = all checks passed; 1 = a check failed; 3 = could not run.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { PYTHON_ARGS, PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";

const home = process.env.AEC_HERMES_HOME;
if (!home || path.resolve(home) === path.resolve(RUNTIME_DIR, "dev-profile")) {
  console.error("mcp-features-probe: set AEC_HERMES_HOME to a temporary profile copy");
  process.exit(3);
}

const SERVER = path.join(RUNTIME_DIR, "fixtures", "mcp-probe-server.py");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForPort(port, deadlineMs) {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    const open = await new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (open) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Appends the two probe servers to `config.yaml` as a new top-level `mcp_servers` block,
 *  or under the existing one. Text merge, same reason as the register-* scripts. */
function addProbeServers(configPath, port) {
  const quoted = (value) => JSON.stringify(value);
  const entries = [
    "  probe_stdio:",
    `    command: ${quoted(PYTHON_BIN)}`,
    `    args: [${[...PYTHON_ARGS, SERVER, "stdio"].map(quoted).join(", ")}]`,
    "  probe_http:",
    `    url: ${quoted(`http://127.0.0.1:${port}/mcp`)}`,
    "    trust: untrusted",
    "    tool_costs:",
    "      set_parameter: 2",
    "    spend_limit: 3",
  ];
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

const port = await freePort();
const http = spawn(PYTHON_BIN, [...PYTHON_ARGS, SERVER, "http", String(port)], {
  stdio: ["ignore", "ignore", "pipe"],
  windowsHide: true,
});
let httpLog = "";
http.stderr.on("data", (chunk) => (httpLog += chunk));

let status = 3;
try {
  if (!(await waitForPort(port, 30_000))) {
    console.error(`mcp-features-probe: HTTP server did not listen on ${port}\n${httpLog.slice(-2000)}`);
  } else {
    addProbeServers(path.join(home, "config.yaml"), port);
    const run = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, path.join(RUNTIME_DIR, "mcp-features-probe.py")], {
      encoding: "utf-8",
      env: { ...process.env, HERMES_HOME: path.resolve(home), PYTHONIOENCODING: "utf-8" },
      timeout: 240_000,
      windowsHide: true,
    });
    process.stdout.write(run.stdout ?? "");
    if (run.status !== 0) process.stderr.write((run.stderr ?? "").split("\n").slice(-30).join("\n"));
    status = run.status === 0 ? 0 : run.status === 1 ? 1 : 3;
  }
} finally {
  if (http.exitCode === null) spawnSync("taskkill", ["/PID", String(http.pid), "/T", "/F"], { stdio: "ignore" });
}
process.exit(status);
