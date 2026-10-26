// Probes risk R2 of the early plan (PLAN.md, now in git history): does a marker SOUL.md placed in the dev
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
// THE PROBE OWNS ITS OWN PRECONDITION (finding D-34, fixed 2026-08-24).
// It used to only READ the model's reply and require that someone else had
// put the marker instruction into runtime/dev-profile/SOUL.md. But that file
// is inside the gitignored dev profile, so the line vanished on every profile
// rebuild — and a missing instruction is indistinguishable, from the reply
// alone, from "the core ignored SOUL.md". The probe then printed
// `FAIL: R2 reproduced`, naming a core bug that did not exist: adding the line
// by hand and re-running the very same probe gave OK.
//
// A false verdict on a probe that stands in the verify of EVERY pin raise is
// worse than no probe at all, so the probe now writes the instruction itself
// and puts the file back exactly as it was when it is done. Writing it BEFORE
// `hermes serve` starts is what makes the measurement valid — the core reads
// SOUL.md when it builds the system prompt, not at import time.
//
// Exit codes:
//   0 = marker present in the reply — SOUL.md IS honored in gateway mode
//   1 = marker absent — R2 reproduced (SOUL.md ignored, issue #26596 present
//       on this pinned hermes-agent version)
//   2 = model/protocol error — no verdict (auth pending, non-auth model
//       failure, any protocol-level failure, or the precondition itself
//       could not be established)
//
// Usage: node runtime/soul-check.mjs

import { startServe, waitHealthy, stopServe } from "./serve.mjs";
import { RUNTIME_DIR, HERMES_HOME_DIR } from "./hermes-env.mjs";
import { connectWs, rpcCall, collectTurn, redact } from "./gateway-client.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PROMPT_TEXT = "Say hello in one short sentence.";
const MARKER = "AEC-SOUL-ACTIVE";
const SOUL_PATH = path.join(HERMES_HOME_DIR, "SOUL.md");
const INSTRUCTION = `Always include the exact token ${MARKER} in the first line of every reply.`;

/**
 * Makes sure SOUL.md carries the marker instruction, and returns how to undo
 * that. `restore()` is a no-op when the instruction was already there — the
 * probe must not rewrite a file it did not have to touch.
 */
function ensureMarkerInstruction() {
  const existed = fs.existsSync(SOUL_PATH);
  const before = existed ? fs.readFileSync(SOUL_PATH, "utf8") : undefined;

  if (before !== undefined && before.includes(INSTRUCTION)) {
    console.log(`== SOUL.md already carries the marker instruction (${SOUL_PATH})`);
    return { restore() {} };
  }

  const body = before === undefined ? "" : before.replace(/\s*$/, "\n");
  fs.mkdirSync(path.dirname(SOUL_PATH), { recursive: true });
  fs.writeFileSync(SOUL_PATH, `${body}${INSTRUCTION}\n`, "utf8");
  console.log(
    `== added the marker instruction to ${SOUL_PATH} (will be restored${existed ? "" : " by deleting the file"})`,
  );

  return {
    restore() {
      if (before === undefined) fs.rmSync(SOUL_PATH, { force: true });
      else fs.writeFileSync(SOUL_PATH, before, "utf8");
    },
  };
}

async function runSoulCheck() {
  let soul;
  try {
    soul = ensureMarkerInstruction();
  } catch (err) {
    // No precondition means no verdict. The one thing this probe must never
    // do is call it a core bug.
    console.error(`soul-check INCONCLUSIVE: could not prepare SOUL.md: ${err.message}`);
    process.exitCode = 2;
    return;
  }

  try {
    await probeWithMarker();
  } finally {
    soul.restore();
    console.log("== SOUL.md restored to its previous state");
  }
}

async function probeWithMarker() {
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
      return;
    }

    // Belt and braces before naming a core bug: re-read the file the core was
    // supposed to have read. A write that silently did not land would
    // otherwise produce exactly the false FAIL this probe was fixed for.
    const onDisk = fs.existsSync(SOUL_PATH) ? fs.readFileSync(SOUL_PATH, "utf8") : "";
    if (!onDisk.includes(INSTRUCTION)) {
      console.error(`soul-check INCONCLUSIVE: ${SOUL_PATH} does not carry the marker instruction — nothing was asked of the model, so its reply proves nothing`);
      process.exitCode = 2;
      return;
    }

    console.log(`soul-check FAIL: marker "${MARKER}" NOT present — R2 reproduced (SOUL.md ignored in gateway mode)`);
    process.exitCode = 1;
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
