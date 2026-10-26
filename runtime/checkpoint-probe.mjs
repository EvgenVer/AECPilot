// One-shot diagnostic for task 1.6.C1 — proves whether Hermes core
// checkpoints are actually visible through `rollback.list` once
// HERMES_TUI_CHECKPOINTS is enabled in our `hermes serve` launch path (see
// the "Checkpoints" header comment in runtime/serve.mjs).
//
// docs/history/specs/checkpoints-rollback.md, Open questions #1: the core snapshots the
// *working directory it computes* for the edited file
// (CheckpointManager.get_working_dir_for_path — climbs to the nearest of
// nine marker files, or falls back to the file's own directory), while
// `rollback.list` always queries the session's cwd verbatim. For a vault
// with no marker at its root, those two can disagree. This script measures
// that empirically instead of guessing:
//
//   1. Starts `hermes serve` via the same startServe/waitHealthy/stopServe
//      functions the desktop app uses.
//   2. Creates a session whose cwd is a throwaway vault-shaped temp dir (a
//      `wiki/` subdir with one file, mirroring docs/history/specs/workspace-sources.md).
//   3. Forces a checkpoint via CheckpointManager.ensure_checkpoint() — the
//      core's own public "take a snapshot now" method
//      (tools/checkpoint_manager.py); no `hermes checkpoints ...` CLI
//      subcommand does this for an arbitrary directory, so this is the
//      documented way to provoke one without running the agent. First with
//      no marker anywhere in the vault (case A), then again after dropping
//      a `package.json` marker in the vault root (case B) — calling
//      `rollback.list(session_id)` after each to show what the UI-facing
//      RPC actually sees.
//   4. Cleans up: stops the server, deletes the temp vault + helper script,
//      and prunes the checkpoint refs this run created from the shared
//      store (they become "orphan" the moment the temp vault is deleted,
//      so pruning them can't touch any real project's history).
//
// Usage: node runtime/checkpoint-probe.mjs
// Needs no model/API key: rollback.list is a plain RPC, and the forced
// snapshot goes through CheckpointManager directly, not through the agent
// (the session's AIAgent is still constructed by the gateway as a side
// effect of the RPC call, same as any real session — it is just never
// asked to run a turn).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HERMES_HOME_DIR, PYTHON_ARGS, PYTHON_BIN } from "./hermes-env.mjs";
import { startServe, waitHealthy, stopServe } from "./serve.mjs";

// Small standalone helper run with the venv's own python.exe. Kept as a
// generated temp file (not a tracked repo file) so this probe stays a
// single new file per its brief. Talks to tools/checkpoint_manager.py
// directly — no agent, no model.
const HELPER_PY = `
import json
import sys


def main():
    mode = sys.argv[1]
    from tools.checkpoint_manager import CheckpointManager

    if mode == "get_workdir":
        mgr = CheckpointManager(enabled=True)
        print(json.dumps({"working_dir": mgr.get_working_dir_for_path(sys.argv[2])}))
    elif mode == "force":
        mgr = CheckpointManager(enabled=True)
        taken = mgr.ensure_checkpoint(sys.argv[2], reason=sys.argv[3])
        print(json.dumps({"taken": taken}))
    elif mode == "prune":
        from tools.checkpoint_manager import prune_checkpoints
        # retention_days=0 disables the age-based sweep entirely (see
        # prune_checkpoints docstring) — only orphans (workdir no longer on
        # disk) are removed, so this can never touch a real, still-existing
        # project's checkpoint history.
        result = prune_checkpoints(retention_days=0, delete_orphans=True, max_total_size_mb=0)
        print(json.dumps(result))
    else:
        print(json.dumps({"error": f"unknown mode: {mode}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
`;

function runPythonHelper(helperPath, args) {
  const result = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, helperPath, ...args], {
    env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR },
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`checkpoint helper spawn failed (${args.join(" ")}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `checkpoint helper exited ${result.status} (${args.join(" ")}): ${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout.trim());
}

/** Minimal newline-delimited JSON-RPC client over the gateway's WS — see
 * runtime/serve.mjs header comment for the wire format. Separate connection
 * from waitHealthy's (that one closes itself after the first frame). */
function createRpcClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  ws.addEventListener("message", (event) => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch {
      return; // not JSON — ignore
    }
    if (frame && frame.id != null && pending.has(frame.id)) {
      pending.get(frame.id)(frame);
      pending.delete(frame.id);
    }
    // Frames without a matching id (gateway.ready, session.info, etc. —
    // JSON-RPC *events*, not responses) are irrelevant to this probe.
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("probe RPC socket error")));
  });

  async function call(method, params, timeoutMs = 60000) {
    await opened;
    const id = nextId++;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`RPC ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, (frame) => {
        clearTimeout(timer);
        resolve(frame);
      });
    });
    ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return response;
  }

  function close() {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  return { call, close };
}

function printRollbackList(label, frame) {
  if (frame.error) {
    console.log(`${label}: RPC ERROR ${frame.error.code} ${frame.error.message}`);
    return;
  }
  const { enabled, checkpoints } = frame.result;
  console.log(`${label}: enabled=${enabled} checkpoints.length=${checkpoints.length}`);
  if (checkpoints.length) {
    console.log(JSON.stringify(checkpoints, null, 2));
  }
}

async function main() {
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aecpilot-checkpoint-probe-vault-"));
  const wikiDir = path.join(vaultRoot, "wiki");
  fs.mkdirSync(wikiDir);
  const notePath = path.join(wikiDir, "note.md");
  fs.writeFileSync(notePath, "# probe note\n");

  const helperPath = path.join(os.tmpdir(), `aecpilot-checkpoint-probe-helper-${process.pid}.py`);
  fs.writeFileSync(helperPath, HELPER_PY);

  let handle;
  let rpc;
  try {
    console.log(`== vault: ${vaultRoot}`);
    console.log("== starting hermes serve");
    handle = await startServe();

    console.log("== waiting for gateway to become healthy");
    await waitHealthy(handle);

    console.log("== opening RPC client");
    rpc = createRpcClient(handle.wsUrl);

    const created = await rpc.call("session.create", { cwd: vaultRoot });
    if (created.error) {
      throw new Error(`session.create failed: ${created.error.code} ${created.error.message}`);
    }
    const sessionId = created.result.session_id;
    console.log(`== session created: ${sessionId} requested cwd=${vaultRoot} resolved cwd=${created.result.info.cwd}`);

    const baseline = await rpc.call("rollback.list", { session_id: sessionId });
    printRollbackList("baseline (no checkpoint taken yet)", baseline);

    // --- Case A: no marker anywhere in the vault -------------------------
    // get_working_dir_for_path climbs from note.md's own directory (wiki/)
    // looking for one of nine markers; with none found it falls back to
    // that immediate directory — NOT the vault root.
    const workdirA = runPythonHelper(helperPath, ["get_workdir", notePath]).working_dir;
    console.log(`== case A — get_working_dir_for_path(${notePath}) = ${workdirA}`);
    const forcedA = runPythonHelper(helperPath, ["force", workdirA, "probe: case A (no marker in vault root)"]);
    console.log(`== case A — ensure_checkpoint(${workdirA}) taken=${forcedA.taken}`);

    const afterA = await rpc.call("rollback.list", { session_id: sessionId });
    printRollbackList("case A — rollback.list(cwd=vault root), NO marker in root", afterA);

    // --- Case B: drop a marker directly in the vault root -----------------
    fs.writeFileSync(path.join(vaultRoot, "package.json"), "{}\n");
    const workdirB = runPythonHelper(helperPath, ["get_workdir", notePath]).working_dir;
    console.log(`== case B — get_working_dir_for_path(${notePath}) = ${workdirB}`);
    const forcedB = runPythonHelper(helperPath, ["force", workdirB, "probe: case B (marker in vault root)"]);
    console.log(`== case B — ensure_checkpoint(${workdirB}) taken=${forcedB.taken}`);

    const afterB = await rpc.call("rollback.list", { session_id: sessionId });
    printRollbackList("case B — rollback.list(cwd=vault root), WITH marker in root", afterB);

    process.exitCode = 0;
  } catch (err) {
    console.error(`probe FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (rpc) rpc.close();
    if (handle) {
      console.log("== stopping hermes serve");
      await stopServe(handle);
    }
    console.log("== cleaning up temp vault + orphaned checkpoint refs");
    try {
      fs.rmSync(vaultRoot, { recursive: true, force: true });
      const pruneResult = runPythonHelper(helperPath, ["prune"]);
      console.log(`== prune result: ${JSON.stringify(pruneResult)}`);
    } catch (err) {
      console.error(`cleanup warning: ${err.message}`);
    } finally {
      fs.rmSync(helperPath, { force: true });
    }
  }
}

void main();
