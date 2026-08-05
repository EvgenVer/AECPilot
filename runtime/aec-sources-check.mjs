// Live verify for task 1.12 (register the aec-sources MCP server in the
// hermes dev profile): builds a throwaway fixture, registers aec-sources
// against it, starts `hermes serve`, asks the model to call the
// `sources_list` tool, and checks the stream for a matching tool-call event
// whose result mentions the "demo" source id.
//
// Reuses the session.create / prompt.submit / session.close protocol from
// runtime/gateway-smoke.mjs (task 0.8), extended with tool.start/tool.complete
// event tracking — see `tui_gateway/server.py`'s _on_tool_start/_on_tool_complete (`_emit("tool.start"|
// "tool.complete", session_id, {tool_id, name, args, result, ...})`), on by
// default (`tool_progress_mode` defaults to "all", off only if a session
// explicitly disables it).
//
// Exit codes (this script's own contract — narrower than gateway-smoke.mjs's,
// see task 1.12 brief):
//   0 = a tool.complete event whose `name` contains "sources_list" and whose
//       payload mentions the "demo" source id was observed
//   2 = protocol OK, model call failed on auth (no/invalid API key —
//       expected in this dev profile; prints "PROTOCOL OK, MODEL AUTH PENDING")
//   3 = any other failure: protocol-level failure, non-auth model failure, or
//       protocol+model both OK but no matching tool-call event was observed
//       (e.g. the MCP tool never got registered — see runtime/README.md)
//
// Usage: node runtime/aec-sources-check.mjs
// AEC_CHECK_TMP overrides the parent dir for the throwaway fixture (default:
// os.tmpdir()).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServe, waitHealthy, stopServe } from "./serve.mjs";
import { RUNTIME_DIR } from "./hermes-env.mjs";
import { connectWs, rpcCall, redact } from "./gateway-client.mjs";
import { registerAecSources } from "./register-aec-sources.mjs";

const PROMPT_TEXT =
  'You have an MCP tool whose name contains "sources_list" (from the ' +
  "aec-sources server). Call it now, then reply listing every source id " +
  "it returned.";

function nowIso() {
  return new Date().toISOString();
}

/** Creates a throwaway source dir (2 txt files, one Cyrillic-named) + vault
 * with a project.json declaring it as source id "demo", under `tmpRoot`. */
function makeTmpFixture(tmpRoot) {
  const sourceDir = path.join(tmpRoot, "source");
  const projectJsonPath = path.join(tmpRoot, "vault", ".aecpilot", "project.json");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.dirname(projectJsonPath), { recursive: true });

  fs.writeFileSync(
    path.join(sourceDir, "hello.txt"),
    "hello from aec-sources-check (task 1.12 tmp fixture)\n",
    "utf-8",
  );
  fs.writeFileSync(
    path.join(sourceDir, "проверка.txt"),
    "проверка кириллицы в имени файла\n",
    "utf-8",
  );

  const project = {
    schema_version: 1,
    name: "aec-sources-check tmp vault",
    created_at: nowIso(),
    sources: [{ id: "demo", root_path: sourceDir, added_at: nowIso() }],
    settings: { wiki_lang: "auto", scan_interval_s: 300, embedding_model: "" },
  };
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(project, null, 2)}\n`, "utf-8");

  return { sourceDir, projectJsonPath };
}

/** Like gateway-client.mjs's collectTurn, but also records every
 * "tool.complete" event's payload — collectTurn ignores those (they're not
 * part of its message-turn contract), so this is a separate, purpose-built
 * collector rather than a change to that shared helper. */
function collectTurnWithToolEvents(ws, sessionId, text, { turnTimeoutMs = 120000, onLog = console.log } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let finalText = "";
    let finalStatus = null;
    const toolEvents = [];

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.removeEventListener("message", onMessage);
      reject(new Error(`timed out waiting for the turn to finish (${turnTimeoutMs}ms)`));
    }, turnTimeoutMs);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(result);
    }

    function onMessage(event) {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.method !== "event") return;
      const evt = frame.params || {};
      if (evt.session_id && evt.session_id !== sessionId) return;

      switch (evt.type) {
        case "message.start":
          started = true;
          onLog("== event: message.start");
          break;
        case "tool.start":
          onLog(`== event: tool.start name=${evt.payload?.name ?? ""}`);
          break;
        case "tool.complete":
          toolEvents.push(evt.payload || {});
          onLog(`== event: tool.complete name=${evt.payload?.name ?? ""}`);
          break;
        case "message.complete":
          finalText = evt.payload?.text ?? "";
          finalStatus = evt.payload?.status ?? null;
          onLog(`== event: message.complete status=${finalStatus}`);
          finish({ started, finalText, finalStatus, toolEvents });
          break;
        case "error":
          onLog(`== event: error message=${redact(evt.payload?.message ?? "(none)")}`);
          finish({ started, finalText: "", finalStatus: "error", crashed: true, toolEvents });
          break;
        case "status.update":
          onLog(`== event: status.update kind=${evt.payload?.kind ?? ""} text=${redact(evt.payload?.text ?? "")}`);
          break;
        default:
          break; // thinking.delta, session.info, etc. — not part of the turn contract
      }
    }

    ws.addEventListener("message", onMessage);
    rpcCall(ws, "prompt.submit", { session_id: sessionId, text }, {
      onEvent: () => {},
    }).then((resp) => {
      onLog(`== rpc prompt.submit -> ${redact(JSON.stringify(resp.result || resp.error))}`);
      if (resp.error) {
        finish({ started: false, finalText: "", finalStatus: null, rpcError: resp.error, toolEvents });
      }
    }, (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        reject(err);
      }
    });
  });
}

/** Finds the first tool.complete payload for a "sources_list"-ish tool name
 * (MCP tools are registered as `mcp_{server}_{tool}`, e.g.
 * `mcp_aec_sources_sources_list` — substring match is prefix-agnostic) whose
 * serialized payload mentions the "demo" source id. */
function findDemoSourcesListEvent(toolEvents) {
  return toolEvents.find((payload) => {
    const name = String(payload?.name ?? "");
    if (!name.includes("sources_list")) return false;
    return JSON.stringify(payload).includes("demo");
  });
}

async function runCheck() {
  const tmpParent = process.env.AEC_CHECK_TMP || os.tmpdir();
  fs.mkdirSync(tmpParent, { recursive: true });
  const tmpRoot = fs.mkdtempSync(path.join(tmpParent, "aec-sources-check-"));

  let handle;
  let ws;
  try {
    console.log(`== tmp fixture root: ${tmpRoot}`);
    const fixture = makeTmpFixture(tmpRoot);
    console.log(`== tmp fixture source dir: ${fixture.sourceDir}`);
    console.log(`== tmp fixture project.json: ${fixture.projectJsonPath}`);

    console.log("== registering aec-sources against the tmp fixture");
    const reg = registerAecSources({ projectJsonPath: fixture.projectJsonPath });
    console.log(`== registered: command=${reg.command} args=--project ${reg.projectJsonPath} (config changed=${reg.changed})`);

    console.log("== starting hermes serve");
    handle = await startServe();

    console.log("== waiting for gateway to become healthy");
    const readyFrame = await waitHealthy(handle, 30000);
    console.log(`== gateway ready: ${JSON.stringify(readyFrame.params?.type ?? readyFrame)}`);

    console.log("== opening WS connection");
    const conn = await connectWs(handle.wsUrl);
    ws = conn.ws;
    console.log(`== ws first frame: method=${conn.readyFrame.method} type=${conn.readyFrame.params?.type}`);

    console.log("== rpc: session.create");
    const createResp = await rpcCall(ws, "session.create", { source: "aec-sources-check", cwd: RUNTIME_DIR });
    if (createResp.error) {
      throw new Error(`session.create failed: ${redact(JSON.stringify(createResp.error))}`);
    }
    const sessionId = createResp.result?.session_id;
    if (!sessionId) {
      throw new Error(`session.create returned no session_id: ${redact(JSON.stringify(createResp.result))}`);
    }
    console.log(`== session created: session_id=${sessionId}`);

    console.log(`== rpc: prompt.submit text=${JSON.stringify(PROMPT_TEXT)}`);
    const turn = await collectTurnWithToolEvents(ws, sessionId, PROMPT_TEXT);

    console.log("== rpc: session.close");
    const closeResp = await rpcCall(ws, "session.close", { session_id: sessionId });
    console.log(`== session.close -> ${redact(JSON.stringify(closeResp.result || closeResp.error))}`);

    ws.close();
    ws = undefined;

    if (turn.rpcError) {
      console.error(`aec-sources-check FAIL: prompt.submit RPC error: ${JSON.stringify(turn.rpcError)}`);
      process.exitCode = 3;
      return;
    }
    if (!turn.started) {
      console.error("aec-sources-check FAIL: never received message.start for the turn");
      process.exitCode = 3;
      return;
    }
    if (turn.crashed) {
      console.error("aec-sources-check FAIL: turn-dispatcher crashed (protocol-level \"error\" event)");
      process.exitCode = 3;
      return;
    }
    if (turn.finalStatus === "error") {
      const redactedText = redact(turn.finalText);
      console.log(`== model error text: ${redactedText}`);
      if (/401|Incorrect API key|invalid_api_key|authentication/i.test(turn.finalText)) {
        console.log("PROTOCOL OK, MODEL AUTH PENDING");
        process.exitCode = 2;
      } else {
        console.log("PROTOCOL OK, MODEL CALL FAILED (non-auth)");
        process.exitCode = 3;
      }
      return;
    }

    const hit = findDemoSourcesListEvent(turn.toolEvents);
    const toolNames = turn.toolEvents.map((e) => e.name).join(", ") || "(none)";
    console.log(`== tool.complete events observed: ${toolNames}`);
    console.log(`== final model reply: ${redact(turn.finalText)}`);

    if (hit) {
      console.log(`== matching tool event: ${redact(JSON.stringify(hit))}`);
      console.log('aec-sources-check OK: a "sources_list" tool call returned the "demo" source');
      process.exitCode = 0;
    } else {
      console.log('aec-sources-check FAIL: no "sources_list" tool-call event mentioning "demo" was observed');
      process.exitCode = 3;
    }
  } catch (err) {
    console.error(`aec-sources-check FAIL: ${err.message}`);
    process.exitCode = 3;
  } finally {
    try {
      ws?.close();
    } catch {
      // ignore
    }
    if (handle) {
      console.log("== stopping hermes serve");
      await stopServe(handle);
    }
    console.log(`== cleaning up tmp fixture: ${tmpRoot}`);
    fs.rmSync(tmpRoot, { recursive: true, force: true });

    console.log("== re-registering aec-sources against the tracked demo fixture (default, permanent)");
    const finalReg = registerAecSources({});
    console.log(`== final registration: project.json=${finalReg.projectJsonPath}`);
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  void runCheck();
}
