// Probes risk R2 (PLAN.md § Risks): does a marker SOUL.md placed in the dev
// profile (HERMES_HOME) actually reach the model's system prompt when the
// agent runs behind `hermes serve` (tui_gateway), or does gateway mode ignore
// it (hermes tracker issue #26596 — "Gateway mode ignores SOUL.md —
// DEFAULT_AGENT_IDENTITY always used")?
//
// Protocol/plumbing reused from runtime/gateway-client.mjs (task 0.8/0.9
// refactor) — same session.create/prompt.submit/session.close cycle as
// gateway-smoke.mjs, just with a different prompt and a different check on
// the reply.
//
// Requires runtime/dev-profile/SOUL.md to contain the marker instruction
// "Always include the exact token AEC-SOUL-ACTIVE in the first line of every
// reply." — this script only reads the model's reply, it does not write
// SOUL.md itself.
//
// Exit codes:
//   0 = marker present in the reply — SOUL.md IS honored in gateway mode
//   1 = marker absent — R2 reproduced (SOUL.md ignored, issue #26596 present
//       on this pinned hermes-agent version)
//   2 = model/protocol error — no verdict (auth pending, non-auth model
//       failure, or any protocol-level failure)
//
// Usage: node runtime/soul-check.mjs

import { startServe, waitHealthy, stopServe } from "./serve.mjs";
import { RUNTIME_DIR } from "./hermes-env.mjs";
import { connectWs, rpcCall, collectTurn, redact } from "./gateway-client.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROMPT_TEXT = "Say hello in one short sentence.";
const MARKER = "AEC-SOUL-ACTIVE";

async function runSoulCheck() {
  console.log("== starting hermes serve");
  const handle = await startServe();

  let ws;
  try {
    console.log("== waiting for gateway to become healthy");
    const readyFrame = await waitHealthy(handle, 30000);
    console.log(`== gateway ready: ${JSON.stringify(readyFrame.params?.type ?? readyFrame)}`);

    console.log("== opening WS connection");
    const conn = await connectWs(handle.wsUrl);
    ws = conn.ws;
    console.log(`== ws first frame: method=${conn.readyFrame.method} type=${conn.readyFrame.params?.type}`);

    console.log("== rpc: session.create");
    const createResp = await rpcCall(ws, "session.create", { source: "soul-check", cwd: RUNTIME_DIR });
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
      console.error(`soul-check INCONCLUSIVE: prompt.submit RPC error: ${JSON.stringify(turn.rpcError)}`);
      process.exitCode = 2;
      return;
    }
    if (!turn.started) {
      console.error("soul-check INCONCLUSIVE: never received message.start for the turn");
      process.exitCode = 2;
      return;
    }
    if (turn.crashed) {
      console.error("soul-check INCONCLUSIVE: turn-dispatcher crashed (protocol-level \"error\" event)");
      process.exitCode = 2;
      return;
    }
    if (turn.finalStatus === "error") {
      const redactedText = redact(turn.finalText);
      console.log(`== model error text: ${redactedText}`);
      console.log("soul-check INCONCLUSIVE: protocol OK, model call failed (auth or other provider error)");
      process.exitCode = 2;
      return;
    }
    if (turn.finalStatus !== "complete" || !turn.finalText || !turn.finalText.trim()) {
      console.error(`soul-check INCONCLUSIVE: turn ended with unexpected status/text: status=${turn.finalStatus} text=${JSON.stringify(turn.finalText)}`);
      process.exitCode = 2;
      return;
    }

    console.log(`== model replied: ${JSON.stringify(turn.finalText)}`);
    const firstLine = turn.finalText.split(/\r?\n/, 1)[0] ?? "";
    console.log(`== first line of reply: ${JSON.stringify(firstLine)}`);

    if (turn.finalText.includes(MARKER)) {
      console.log(`soul-check OK: marker "${MARKER}" present — SOUL.md is honored in gateway mode (R2 not reproduced)`);
      process.exitCode = 0;
    } else {
      console.log(`soul-check FAIL: marker "${MARKER}" NOT present — R2 reproduced (SOUL.md ignored in gateway mode)`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`soul-check INCONCLUSIVE: ${err.message}`);
    process.exitCode = 2;
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
  void runSoulCheck();
}
