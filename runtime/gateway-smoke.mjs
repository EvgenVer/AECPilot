// Contract smoke test for the tui_gateway JSON-RPC/WebSocket protocol (task
// 0.8): create a session, send a user message, collect the stream, close it.
// No npm deps: node:child_process/net (via serve.mjs) + the Node 22
// built-in global WebSocket.
//
// Protocol map (from runtime/.hermes-venv/Lib/site-packages/tui_gateway/
// server.py and ws.py — see AECPilot TASKS.md task 0.8 for the write-up):
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
import { fileURLToPath } from "node:url";
import path from "node:path";

const RPC_TIMEOUT_MS = 60000;
const TURN_TIMEOUT_MS = 120000;
const PROMPT_TEXT = "Reply with exactly: PONG";
const REDACT_MAX_LEN = 120;

// Provider error text (e.g. OpenAI's HTTP 401 body) can echo a fragment of
// the API key back verbatim ("Incorrect API key provided: sk-...") — mask
// any secret-shaped token before it ever reaches a log line, and cap length
// so a runaway payload can't flood stdout.
function redact(text) {
  const str = String(text ?? "");
  const masked = str.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***");
  return masked.length > REDACT_MAX_LEN
    ? `${masked.slice(0, REDACT_MAX_LEN)}…`
    : masked;
}

/** Sends one JSON-RPC request and resolves with its {"result"|"error"} response.
 * Also invokes onEvent for every intervening "event" frame (streamed replies
 * arrive as events, not as the request's own response). */
function rpcCall(ws, method, params, { onEvent, timeoutMs = RPC_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const id = `smoke-${method}-${Date.now()}`;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.removeEventListener("message", onMessage);
      reject(new Error(`timed out waiting for response to "${method}" (${timeoutMs}ms)`));
    }, timeoutMs);

    function onMessage(event) {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return; // not JSON — ignore
      }
      if (frame.method === "event") {
        onEvent?.(frame.params);
        return;
      }
      if (frame.id !== id) return; // response to a different in-flight call
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      resolve(frame);
    }

    ws.addEventListener("message", onMessage);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
}

/** Sends "prompt.submit" and collects the streamed turn (message.start /
 * message.delta / message.complete / error events) until the turn ends. */
function submitAndCollectTurn(ws, sessionId, text) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let deltaCount = 0;
    let finalText = "";
    let finalStatus = null;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.removeEventListener("message", onMessage);
      reject(new Error(`timed out waiting for the turn to finish (${TURN_TIMEOUT_MS}ms)`));
    }, TURN_TIMEOUT_MS);

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
      if (evt.session_id && evt.session_id !== sessionId) return; // not ours

      switch (evt.type) {
        case "message.start":
          started = true;
          console.log("== event: message.start");
          break;
        case "message.delta":
          deltaCount += 1;
          break;
        case "message.complete":
          finalText = evt.payload?.text ?? "";
          finalStatus = evt.payload?.status ?? null;
          console.log(`== event: message.complete status=${finalStatus} deltas=${deltaCount}`);
          finish({ started, deltaCount, finalText, finalStatus });
          break;
        case "error":
          console.log(`== event: error message=${redact(evt.payload?.message ?? "(none)")}`);
          finish({ started, deltaCount, finalText: "", finalStatus: "error", crashed: true });
          break;
        case "status.update":
          console.log(`== event: status.update kind=${evt.payload?.kind ?? ""} text=${redact(evt.payload?.text ?? "")}`);
          break;
        default:
          break; // thinking.delta, session.info, etc. — not part of the turn contract
      }
    }

    ws.addEventListener("message", onMessage);
    rpcCall(ws, "prompt.submit", { session_id: sessionId, text }, {
      onEvent: () => {}, // message events are consumed by the listener above, not here
    }).then((resp) => {
      console.log(`== rpc prompt.submit -> ${JSON.stringify(resp.result || resp.error)}`);
      if (resp.error) {
        finish({ started: false, deltaCount: 0, finalText: "", finalStatus: null, rpcError: resp.error });
      }
      // On success the turn streams asynchronously — onMessage above resolves it.
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

async function runSmoke() {
  console.log("== starting hermes serve");
  const handle = await startServe();

  let ws;
  try {
    console.log("== waiting for gateway to become healthy");
    const readyFrame = await waitHealthy(handle, 30000);
    console.log(`== gateway ready: ${JSON.stringify(readyFrame.params?.type ?? readyFrame)}`);

    console.log("== opening WS connection");
    ws = new WebSocket(handle.wsUrl);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("WS connect timed out")), 15000);
      ws.addEventListener("open", () => {
        clearTimeout(t);
        resolve();
      });
      ws.addEventListener("error", (e) => {
        clearTimeout(t);
        reject(new Error(`WS connect error: ${e.message || e}`));
      });
    });

    // First frame after connect is the gateway.ready event (per ws.py).
    const firstFrame = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("did not receive gateway.ready after WS connect")), 15000);
      ws.addEventListener("message", function onFirst(event) {
        clearTimeout(t);
        ws.removeEventListener("message", onFirst);
        try {
          resolve(JSON.parse(event.data));
        } catch (e) {
          reject(e);
        }
      });
    });
    console.log(`== ws first frame: method=${firstFrame.method} type=${firstFrame.params?.type}`);
    if (firstFrame.method !== "event" || firstFrame.params?.type !== "gateway.ready") {
      throw new Error(`expected gateway.ready as the first WS frame, got: ${JSON.stringify(firstFrame)}`);
    }

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
    const turn = await submitAndCollectTurn(ws, sessionId, PROMPT_TEXT);

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
