// Shared JSON-RPC/WebSocket client helpers for the tui_gateway protocol,
// factored out of runtime/gateway-smoke.mjs (task 0.8) so runtime/soul-check.mjs
// (task 0.9) can reuse the same connect/rpc/turn-collection logic instead of
// duplicating it. Pure helpers — no process lifecycle (that stays in
// serve.mjs) and no console output beyond what each caller opts into.
//
// See runtime/gateway-smoke.mjs's header comment for the full protocol map
// (session.create / prompt.submit / message.start / message.delta /
// message.complete / session.close).

const DEFAULT_RPC_TIMEOUT_MS = 60000;
const DEFAULT_TURN_TIMEOUT_MS = 120000;
const DEFAULT_REDACT_MAX_LEN = 120;

// Provider error text (e.g. OpenAI's HTTP 401 body) can echo a fragment of
// the API key back verbatim ("Incorrect API key provided: sk-...") — mask
// any secret-shaped token before it ever reaches a log line, and cap length
// so a runaway payload can't flood stdout.
export function redact(text, { maxLen = DEFAULT_REDACT_MAX_LEN } = {}) {
  const str = String(text ?? "");
  const masked = str.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***");
  return masked.length > maxLen ? `${masked.slice(0, maxLen)}…` : masked;
}

/** Opens the gateway WS connection and waits for the mandatory first frame
 * (the `gateway.ready` event, per ws.py). Returns { ws, readyFrame }. */
export async function connectWs(wsUrl, { connectTimeoutMs = 15000, readyTimeoutMs = 15000 } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WS connect timed out")), connectTimeoutMs);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", (e) => {
      clearTimeout(t);
      reject(new Error(`WS connect error: ${e.message || e}`));
    });
  });

  const readyFrame = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("did not receive gateway.ready after WS connect")), readyTimeoutMs);
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
  if (readyFrame.method !== "event" || readyFrame.params?.type !== "gateway.ready") {
    throw new Error(`expected gateway.ready as the first WS frame, got: ${JSON.stringify(readyFrame)}`);
  }

  return { ws, readyFrame };
}

/** Sends one JSON-RPC request and resolves with its {"result"|"error"} response.
 * Also invokes onEvent for every intervening "event" frame (streamed replies
 * arrive as events, not as the request's own response). */
export function rpcCall(ws, method, params, { onEvent, timeoutMs = DEFAULT_RPC_TIMEOUT_MS } = {}) {
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
 * message.delta / message.complete / error events) until the turn ends.
 * `onLog` receives one string per notable event (default: console.log) so
 * callers control/suppress logging without duplicating the collection logic. */
export function collectTurn(ws, sessionId, text, { turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS, onLog = console.log } = {}) {
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
      if (evt.session_id && evt.session_id !== sessionId) return; // not ours

      switch (evt.type) {
        case "message.start":
          started = true;
          onLog("== event: message.start");
          break;
        case "message.delta":
          deltaCount += 1;
          break;
        case "message.complete":
          finalText = evt.payload?.text ?? "";
          finalStatus = evt.payload?.status ?? null;
          onLog(`== event: message.complete status=${finalStatus} deltas=${deltaCount}`);
          finish({ started, deltaCount, finalText, finalStatus });
          break;
        case "error":
          onLog(`== event: error message=${redact(evt.payload?.message ?? "(none)")}`);
          finish({ started, deltaCount, finalText: "", finalStatus: "error", crashed: true });
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
      onEvent: () => {}, // message events are consumed by the listener above, not here
    }).then((resp) => {
      onLog(`== rpc prompt.submit -> ${JSON.stringify(resp.result || resp.error)}`);
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
