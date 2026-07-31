// Contract probe for task 1.6.B3.1 — measures what `skills.*` and
// `learning.*` actually answer on THIS build, before batch 3 is written
// against them.
//
// Why a probe and not a reading of their code: three of the questions batch 3
// depends on cannot be answered by reading at all.
//   1. Which actions reach the network? `skills.manage {action:'search'}` goes
//      to a GitHub-backed hub; `list` does not. The probe times each call and
//      reports the error a call makes without connectivity, so the screen can
//      say "хаб недоступен" instead of "ошибка".
//   2. Does `command.dispatch {name:'curator'}` exist at all on the gateway?
//      Their `_handle_curator_command` lives in the CLI mixin, and the
//      gateway's dispatcher resolves names through its own table — task
//      1.6.B3.8 assumed it resolves, and that assumption is worth one call.
//   3. Does `skills.reload` change what `skills.manage list` returns? Only a
//      live before/after comparison shows that.
//
// It creates nothing and deletes nothing: every call below is a read, except
// `skills.reload`, which re-scans the skill directories and is the same thing
// their own `/reload-skills` does. Deliberately NOT probed: `learning.edit`,
// `learning.delete` and `skills.manage {action:'install'}` — they write to the
// profile, and the last probe that wrote to the dev profile (task 1.6.B2a.1)
// left it dirty when a later call failed. Their shapes are read off
// `agent/learning_mutations.py` instead and recorded below.
//
// Usage: node runtime/skills-probe.mjs
// Needs no model/API key — every method here is a plain RPC.

import { startServe, waitHealthy, stopServe } from "./serve.mjs";

/** Minimal newline-delimited JSON-RPC client — same shape as
 * runtime/checkpoint-probe.mjs's, kept local so the probes stay independent
 * single files. */
function createRpcClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  ws.addEventListener("message", (event) => {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch {
      return;
    }
    if (frame && frame.id != null && pending.has(frame.id)) {
      pending.get(frame.id)(frame);
      pending.delete(frame.id);
    }
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

  return { call, close: () => ws.close() };
}

function describe(frame) {
  if (frame.error) return `ERROR ${frame.error.code}: ${frame.error.message}`;
  const keys = Object.keys(frame.result ?? {});
  return `ok, keys: ${keys.join(", ") || "(none)"}`;
}

async function timed(label, fn) {
  const started = process.hrtime.bigint();
  let frame;
  try {
    frame = await fn();
  } catch (error) {
    console.log(`  ${label}: THREW ${error.message}`);
    return undefined;
  }
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`  ${label}: ${describe(frame)}  [${ms.toFixed(0)} ms]`);
  return frame;
}

async function main() {
  let handle;
  let rpc;
  try {
    console.log("starting hermes serve…");
    handle = await startServe();
    await waitHealthy(handle);
    rpc = createRpcClient(handle.wsUrl);

    const created = await rpc.call("session.create", { source: "aecpilot-skills-probe" });
    const sessionId = created.result?.session_id;
    console.log(`session: ${sessionId}\n`);

    console.log("skills.manage:");
    const listed = await timed("list", () => rpc.call("skills.manage", { action: "list" }));
    const categories = Object.keys(listed?.result?.skills ?? {});
    console.log(
      `    categories: ${categories.length} — ${categories.slice(0, 6).join(", ")}${
        categories.length > 6 ? ", …" : ""
      }`
    );
    const totalSkills = Object.values(listed?.result?.skills ?? {}).reduce(
      (sum, names) => sum + (Array.isArray(names) ? names.length : 0),
      0
    );
    console.log(`    skills total: ${totalSkills}`);

    // Hub actions. These are the ones that go to the network; the point is
    // WHAT they answer when it is unavailable, not whether they succeed.
    await timed("search (hub, network)", () =>
      rpc.call("skills.manage", { action: "search", query: "test" }, 20000)
    );
    await timed("browse (hub, network)", () =>
      rpc.call("skills.manage", { action: "browse", page: 1 }, 20000)
    );
    await timed("unknown action", () => rpc.call("skills.manage", { action: "nope" }));

    console.log("\nskills.reload:");
    const reloaded = await timed("reload", () => rpc.call("skills.reload", {}));
    const result = reloaded?.result?.result ?? {};
    console.log(
      `    added: ${(result.added ?? []).length}, removed: ${(result.removed ?? []).length}, total: ${
        result.total ?? "?"
      }`
    );
    const afterReload = await rpc.call("skills.manage", { action: "list" });
    const sameAfterReload =
      JSON.stringify(listed?.result?.skills ?? {}) ===
      JSON.stringify(afterReload.result?.skills ?? {});
    console.log(`    list unchanged after reload: ${sameAfterReload}`);

    console.log("\nlearning.frames:");
    const frames = await timed("frames {cols:20, rows:12, frames:2}", () =>
      rpc.call("learning.frames", { cols: 20, rows: 12, frames: 2 })
    );
    const payload = frames?.result ?? {};
    console.log(`    count: ${payload.count}`);
    console.log(`    buckets: ${(payload.buckets ?? []).length}`);
    const firstBucket = (payload.buckets ?? [])[0];
    if (firstBucket) {
      console.log(`    bucket keys: ${Object.keys(firstBucket).join(", ")}`);
      const firstNode = (firstBucket.nodes ?? [])[0];
      if (firstNode) console.log(`    node keys: ${Object.keys(firstNode).join(", ")}`);
    } else {
      console.log("    (no buckets — nothing learned in this profile yet)");
    }

    console.log("\nlearning.detail:");
    const firstSkillName = (listed?.result?.skills ?? {})[categories[0]]?.[0];
    if (firstSkillName) {
      await timed(`detail {id:'${firstSkillName}'}`, () =>
        rpc.call("learning.detail", { id: firstSkillName })
      );
    }
    await timed("detail {id:'definitely-not-a-skill'}", () =>
      rpc.call("learning.detail", { id: "definitely-not-a-skill" })
    );
    await timed("detail {id:'memory:nowhere:0'}", () =>
      rpc.call("learning.detail", { id: "memory:nowhere:0" })
    );

    console.log("\ncommand.dispatch curator (task 1.6.B3.8 assumed this resolves):");
    await timed("curator status", () =>
      rpc.call("command.dispatch", { name: "curator", arg: "status", session_id: sessionId })
    );
    await timed("curator list-archived", () =>
      rpc.call("command.dispatch", {
        name: "curator",
        arg: "list-archived",
        session_id: sessionId
      })
    );

    // The RPC side has two holes on this platform (see the summary printed at
    // the end). Their REST surface is the same process, same token — decision
    // R1 allows it exactly where RPC does not reach, and these three routes
    // are that case.
    console.log("\nREST fallbacks on the same process:");
    const base = `http://${handle.host}:${handle.port}`;
    const headers = { "X-Hermes-Session-Token": handle.token };
    for (const route of ["/api/learning/graph", "/api/skills", "/api/curator"]) {
      const started = process.hrtime.bigint();
      try {
        const response = await fetch(`${base}${route}`, { headers });
        const body = await response.json();
        const ms = Number(process.hrtime.bigint() - started) / 1e6;
        const shape = Array.isArray(body)
          ? `array[${body.length}]${body[0] ? ` keys: ${Object.keys(body[0]).join(", ")}` : ""}`
          : `keys: ${Object.keys(body).join(", ")}`;
        console.log(`  GET ${route}: ${response.status} ${shape}  [${ms.toFixed(0)} ms]`);
      } catch (error) {
        console.log(`  GET ${route}: THREW ${error.message}`);
      }
    }

    console.log(
      "\nNOT probed on purpose (they write to the profile): learning.edit, learning.delete, skills.manage install."
    );
  } finally {
    // Cleanup in `finally` — the lesson of probe 1.6.B2a.1, which left the
    // dev profile dirty because its restore step sat after a call that threw.
    rpc?.close();
    if (handle) await stopServe(handle);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
