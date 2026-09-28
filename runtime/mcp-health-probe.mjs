// Live measurement for task 3G.0 (D-153): do our MCP tools survive the core's
// stdio health proof on 0.21.5?
//
// The finding it answers. A request captured on 28.09 carried no `aec-*` tool,
// not even in the tool_search catalog, although the core had registered 24 of
// them. 0.21.5 gives a stdio server with no keepalive a proof window of 180 s
// (`_DEFAULT_KEEPALIVE_INTERVAL`): at its end the server counts as healthy only
// if a child PID it captured at spawn is still alive
// (`mcp_tool_server_run.py`, `_stdio_children_dead`). If not, the server goes
// `degraded` and its tools fail `check_fn` — they vanish from the session.
//
// No model call: `tools.show` returns the session's tools after `check_fn`
// (before tool_search assembly), which is exactly the filter in question.
//
// Usage: AEC_HERMES_HOME=<profile with mcp_servers> node runtime/mcp-health-probe.mjs <project dir>
// Exit codes: 0 = all MCP tools still present after the proof window;
// 1 = some vanished (defect reproduced); 3 = could not measure.

import fs from "node:fs";
import path from "node:path";
import { startServe, waitHealthy, stopServe, HERMES_HOME_DIR } from "./serve.mjs";
import { connectWs, rpcCall } from "./gateway-client.mjs";

const PROOF_WINDOW_MS = 180_000;
const MARGIN_MS = 30_000;

function mcpCounts(result) {
  const counts = {};
  for (const section of result.sections ?? []) {
    for (const tool of section.tools) {
      if (tool.name.startsWith("mcp_")) counts[section.name] = (counts[section.name] ?? 0) + 1;
    }
  }
  return counts;
}

function unwrap(response) {
  if (response.error) throw new Error(JSON.stringify(response.error));
  return response.result;
}

function healthLines() {
  const log = path.join(HERMES_HOME_DIR, "logs", "agent.log");
  if (!fs.existsSync(log)) return [];
  return fs
    .readFileSync(log, "utf-8")
    .split("\n")
    .filter((line) => /proved healthy|registered \d+ tool|failed initial connection/.test(line))
    .map((line) => line.slice(0, 220));
}

const projectDir = process.argv[2];
if (!projectDir) {
  console.error("usage: node runtime/mcp-health-probe.mjs <project dir>");
  process.exit(3);
}

const serve = await startServe();
let exitCode = 3;
try {
  await waitHealthy(serve);
  const { ws } = await connectWs(serve.wsUrl);
  const created = unwrap(await rpcCall(ws, "session.create", { source: "desktop", cwd: projectDir }));
  const sessionId = created.session_id;
  // The first tools.show triggers MCP discovery; give it the connect window.
  await new Promise((r) => setTimeout(r, 20_000));
  const before = mcpCounts(unwrap(await rpcCall(ws, "tools.show", { session_id: sessionId })));
  console.log(`t+20s   MCP tools: ${JSON.stringify(before)}`);
  await new Promise((r) => setTimeout(r, PROOF_WINDOW_MS + MARGIN_MS - 20_000));
  const after = mcpCounts(unwrap(await rpcCall(ws, "tools.show", { session_id: sessionId })));
  console.log(`t+210s  MCP tools: ${JSON.stringify(after)}`);
  for (const line of healthLines()) console.log(`  log: ${line}`);
  // Second D-153 symptom: our app gives reload.mcp 15 s (RELOAD_MCP_TIMEOUT_MS).
  for (let i = 1; i <= 3; i += 1) {
    const t0 = Date.now();
    const reload = await rpcCall(ws, "reload.mcp", { confirm: true }, { timeoutMs: 120_000 });
    console.log(`reload.mcp #${i}: ${Date.now() - t0} ms, status=${reload.result?.status ?? JSON.stringify(reload.error)}`);
  }
  const lost = Object.keys(before).filter((k) => (after[k] ?? 0) < before[k]);
  if (Object.keys(before).length === 0) {
    console.log("VERDICT: no MCP tools even before the proof window — cannot measure the window");
  } else if (lost.length) {
    console.log(`VERDICT: REPRODUCED — tools vanished after the proof window: ${lost.join(", ")}`);
    exitCode = 1;
  } else {
    console.log("VERDICT: all MCP tools survived the proof window");
    exitCode = 0;
  }
  await rpcCall(ws, "session.close", { session_id: sessionId }).catch(() => {});
  ws.close();
} catch (err) {
  console.error(`probe failed: ${err?.message ?? err}`);
} finally {
  await stopServe(serve);
}
process.exit(exitCode);
