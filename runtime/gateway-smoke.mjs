// Contract smoke test for the tui_gateway JSON-RPC/WebSocket protocol (task
// 0.8): create a session, send a user message, collect the stream, close it.
// No npm deps: node:child_process/net (via serve.mjs) + the Node 22
// built-in global WebSocket.
//
// Protocol map (from `tui_gateway/server.py` and `ws.py` in the core checkout — the write-up is task 0.8 in the ledger before 2026-08-05, `git show 64fa482^:TASKS.md`):
//   - connect                → server sends {"method":"event","params":{"type":"gateway.ready",...}}
//   - "session.create"       → {"result":{"session_id": "...", ...}}
//   - "prompt.submit"        → {"result":{"status":"streaming"}}, reply streams via events:
//       event type "message.start"    — turn began
//       event type "message.delta"    — {"text": "<token>"} per streamed chunk
//       event type "thinking.delta"   — {"text": "..."} reasoning/thinking filler (optional)
//       event type "status.update"    — {"kind": "...", "text": "..."} lifecycle notes (e.g. retry/error diagnostics)
//       event type "message.complete" — {"text": "<final>", "status": "complete"|"error"|"interrupted"}
//       event type "error"            — {"message": "..."} (turn-dispatcher crash, not a provider error)
//   - "session.close"        → {"result":{"closed": true|false}}
// A provider/auth failure (no/invalid API key) surfaces as "message.complete"
// with status "error" and the raw provider error text (e.g. "HTTP 401:
// Incorrect API key provided: ...") — NOT a JSON-RPC error and NOT an "error"
// event. See _run_prompt_submit in server.py.
//
// Exit codes:
//   0 = full cycle + a real model reply
//   1 = any protocol-level failure (session/message/stream/close broke)
//   2 = protocol OK, model call failed on auth (no/invalid API key —
//       expected in this dev profile; prints "PROTOCOL OK, MODEL AUTH PENDING")
//   3 = protocol OK, model call failed for a non-auth reason (network,
//       rate limit, 5xx, ...; prints "PROTOCOL OK, MODEL CALL FAILED (non-auth)")
//
// Usage: node runtime/gateway-smoke.mjs

import { startServe, waitHealthy, stopServe } from "./serve.mjs";
import { RUNTIME_DIR } from "./hermes-env.mjs";
import { connectWs, rpcCall, collectTurn, redact } from "./gateway-client.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROMPT_TEXT = "Reply with exactly: PONG";

async function runSmoke() {
  console.log("== starting hermes serve");
  const handle = await startServe();

  let ws;
  try {
    console.log("== waiting for gateway to become healthy");
    const readyFrame = await waitHealthy(handle);
    console.log(`== gateway ready: ${JSON.stringify(readyFrame.params?.type ?? readyFrame)}`);

    console.log("== opening WS connection");
    const conn = await connectWs(handle.wsUrl);
    ws = conn.ws;
    const firstFrame = conn.readyFrame;
    console.log(`== ws first frame: method=${firstFrame.method} type=${firstFrame.params?.type}`);

    console.log("== rpc: session.create");
    const createResp = await rpcCall(ws, "session.create", { source: "smoke", cwd: RUNTIME_DIR });
    if (createResp.error) {
      throw new Error(`session.create failed: ${JSON.stringify(createResp.error)}`);
    }
    const sessionId = createResp.result?.session_id;
    if (!sessionId) {
      throw new Error(`session.create returned no session_id: ${JSON.stringify(createResp.result)}`);
    }
    console.log(`== session created: session_id=${sessionId}`);

    console.log(`== rpc: prompt.submit text=${JSON.stringify(PROMPT_TEXT)}`);
    const turn = await collectTurn(ws, sessionId, PROMPT_TEXT);

    console.log("== rpc: session.close");
    const closeResp = await rpcCall(ws, "session.close", { session_id: sessionId });
    console.log(`== session.close -> ${JSON.stringify(closeResp.result || closeResp.error)}`);

    ws.close();
    ws = undefined;

    if (turn.rpcError) {
      console.error(`smoke FAIL: prompt.submit RPC error: ${JSON.stringify(turn.rpcError)}`);
      process.exitCode = 1;
      return;
    }
    if (!turn.started) {
      console.error("smoke FAIL: never received message.start for the turn");
      process.exitCode = 1;
      return;
    }
    if (turn.crashed) {
      console.error("smoke FAIL: turn-dispatcher crashed (protocol-level \"error\" event, not a model/provider error)");
      process.exitCode = 1;
      return;
    }
    if (turn.finalStatus === "error") {
      // Protocol worked end-to-end (session created, message accepted, stream
      // completed) but the model call itself failed. Distinguish "no/invalid
      // API key" (expected in this dev profile until the owner fills in a
      // real key) from any other provider failure (network, rate limit,
      // 5xx, ...) so the latter isn't silently masked as "just needs a key".
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
    if (turn.finalStatus !== "complete" || !turn.finalText || !turn.finalText.trim()) {
      console.error(`smoke FAIL: turn ended with unexpected status/text: status=${turn.finalStatus} text=${JSON.stringify(turn.finalText)}`);
      process.exitCode = 1;
      return;
    }

    console.log(`== model replied: ${JSON.stringify(turn.finalText)}`);
    console.log("smoke OK: full cycle passed with a real model reply");
    process.exitCode = 0;
  } catch (err) {
    console.error(`smoke FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    try {
      ws?.close();
    } catch {
      // ignore
    }
    console.log("== stopping hermes serve");
    await stopServe(handle);
  }
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  void runSmoke();
}
