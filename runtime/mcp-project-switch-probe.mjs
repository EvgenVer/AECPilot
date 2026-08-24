// Live measurement for task 1.7.8: after switching the active project, does
// the agent still reach the PREVIOUS project's sources?
//
// Why it needs measuring again on 0.20.0. Our rule since 1.12 is "rewrite
// config.yaml, then call `reload.mcp {confirm:true}`" — rewriting the config
// alone never restarted an already-spawned stdio child, so the child kept
// serving `--project <old>`. 0.20.0 changed the startup path: MCP servers now
// register their tools from an on-disk schema cache
// (`tools/mcp_schema_cache.py`, keyed by server name + a fingerprint of
// command/args/url/transport/tool filters) and only spawn on first use. Our
// registration puts the project path in `args`, so the fingerprint changes
// with the project — which raises the question this probe answers: is the
// reload still required, or does the lazy path pick the new project up?
//
// Three measurements in ONE serve process (a restart would trivially fix
// everything and prove nothing):
//   1. project A registered           → agent must see A's source, not B's
//   2. config rewritten to B, NO reload → what does the agent see now?
//   3. `reload.mcp {confirm:true}`      → agent must see B's source, not A's
//
// Each measurement uses a fresh session, so nothing is explained away by one
// session's cached tool list.
//
// Usage: node runtime/mcp-project-switch-probe.mjs
// Needs a working model key (the agent has to actually call the tool).
// Exit codes: 0 = measured and the answer is recorded below; 3 = the probe
// could not measure (protocol failure, model failure) — no conclusion.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServe, waitHealthy, stopServe, HERMES_HOME_DIR } from "./serve.mjs";
import { RUNTIME_DIR } from "./hermes-env.mjs";
import { connectWs, rpcCall, redact } from "./gateway-client.mjs";
import { registerAecSources } from "./register-aec-sources.mjs";

const PROMPT_TEXT =
  'You have an MCP tool whose name contains "sources_list" (from the ' +
  "aec-sources server). Call it now, then reply listing every source id " +
  "it returned, and nothing else.";

const SCHEMA_CACHE = path.join(HERMES_HOME_DIR, "cache", "mcp_schema_cache.json");

function nowIso() {
  return new Date().toISOString();
}

/** One throwaway project whose single source id is unique to it, so "which
 * project is the agent talking to" is answerable from the tool result alone. */
function makeProject(root, sourceId) {
  const sourceDir = path.join(root, `${sourceId}-files`);
  const projectJsonPath = path.join(root, sourceId, ".aecpilot", "project.json");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(path.dirname(projectJsonPath), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "marker.txt"), `${sourceId}\n`, "utf-8");

  const project = {
    schema_version: 1,
    name: `mcp-project-switch-probe ${sourceId}`,
    created_at: nowIso(),
    sources: [{ id: sourceId, root_path: sourceDir, added_at: nowIso() }],
    settings: { wiki_lang: "auto", scan_interval_s: 300, embedding_model: "" },
  };
  fs.writeFileSync(projectJsonPath, `${JSON.stringify(project, null, 2)}\n`, "utf-8");
  return { sourceId, projectJsonPath };
}

/** Runs one turn and returns every tool.complete payload plus the final text. */
function collectTurn(ws, sessionId, text, { turnTimeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let finalText = "";
    let finalStatus = null;
    const toolEvents = [];

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.removeEventListener("message", onMessage);
      reject(new Error(`turn timed out after ${turnTimeoutMs}ms`));
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
      if (evt.type === "tool.complete") toolEvents.push(evt.payload || {});
      if (evt.type === "message.complete") {
        finalText = evt.payload?.text ?? "";
        finalStatus = evt.payload?.status ?? null;
        finish({ finalText, finalStatus, toolEvents });
      }
      if (evt.type === "error") {
        finish({ finalText: "", finalStatus: "error", toolEvents, crashed: true });
      }
    }

    ws.addEventListener("message", onMessage);
    rpcCall(ws, "prompt.submit", { session_id: sessionId, text }).then(
      (resp) => {
        if (resp.error) finish({ finalText: "", finalStatus: null, toolEvents, rpcError: resp.error });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        reject(err);
      },
    );
  });
}

/** Which project ids appear in this turn's sources_list results. */
function idsSeen(turn, candidates) {
  const blob = JSON.stringify(
    turn.toolEvents.filter((e) => String(e?.name ?? "").includes("sources_list")),
  );
  return candidates.filter((id) => blob.includes(`"${id}"`));
}

async function ask(ws, label, candidates) {
  const created = await rpcCall(ws, "session.create", {
    source: "mcp-project-switch-probe",
    cwd: RUNTIME_DIR,
  });
  if (created.error) throw new Error(`session.create failed: ${redact(JSON.stringify(created.error))}`);
  const sessionId = created.result.session_id;

  const turn = await collectTurn(ws, sessionId, PROMPT_TEXT);
  await rpcCall(ws, "session.close", { session_id: sessionId });

  if (turn.rpcError || turn.crashed || turn.finalStatus === "error") {
    throw new Error(`${label}: turn failed (${redact(turn.finalText || JSON.stringify(turn.rpcError))})`);
  }
  const seen = idsSeen(turn, candidates);
  const tools = turn.toolEvents.map((e) => e.name).join(", ") || "(нет вызовов)";
  console.log(`${label}: источники ${seen.length ? seen.join(", ") : "(ни одного)"}   [инструменты: ${tools}]`);
  return seen;
}

function cacheFingerprints() {
  if (!fs.existsSync(SCHEMA_CACHE)) return "(файла нет)";
  try {
    const data = JSON.parse(fs.readFileSync(SCHEMA_CACHE, "utf-8"));
    return Object.entries(data)
      .map(([name, entry]) => `${name}=${entry?.fingerprint ?? "?"}`)
      .join(", ");
  } catch (err) {
    return `(нечитаем: ${err.message})`;
  }
}

async function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-switch-probe-"));
  const A = makeProject(tmpRoot, "alphasrc");
  const B = makeProject(tmpRoot, "betasrc");
  const ids = [A.sourceId, B.sourceId];

  let handle;
  let ws;
  try {
    console.log(`== фикстура: ${tmpRoot}`);
    registerAecSources({ projectJsonPath: A.projectJsonPath });
    console.log(`== зарегистрирован проект A (${A.sourceId})`);

    handle = await startServe();
    await waitHealthy(handle);
    const conn = await connectWs(handle.wsUrl);
    ws = conn.ws;
    console.log(`== кэш схем до первого вызова: ${cacheFingerprints()}`);

    const step1 = await ask(ws, "1. проект A", ids);
    console.log(`== кэш схем после первого вызова: ${cacheFingerprints()}`);

    const changed = registerAecSources({ projectJsonPath: B.projectJsonPath });
    console.log(`== config.yaml переписан на проект B (${B.sourceId}); changed=${changed.changed}`);
    const step2 = await ask(ws, "2. проект B, БЕЗ reload.mcp", ids);

    const reload = await rpcCall(ws, "reload.mcp", { confirm: true });
    console.log(`== reload.mcp -> ${redact(JSON.stringify(reload.result || reload.error))}`);
    const step3 = await ask(ws, "3. проект B, ПОСЛЕ reload.mcp", ids);
    console.log(`== кэш схем в конце: ${cacheFingerprints()}`);

    const leaks = step2.includes(A.sourceId);
    console.log("");
    console.log("ВЫВОД:");
    console.log(
      leaks
        ? "  reload.mcp ОСТАЁТСЯ ОБЯЗАТЕЛЬНЫМ: без него агент продолжает видеть источники прежнего проекта."
        : "  без reload.mcp агент источники прежнего проекта уже НЕ видит.",
    );
    console.log(
      step3.includes(B.sourceId) && !step3.includes(A.sourceId)
        ? "  после reload.mcp виден ровно новый проект."
        : `  ПОСЛЕ reload.mcp КАРТИНА НЕ ЧИСТАЯ: ${step3.join(", ") || "(ни одного источника)"}`,
    );
    process.exitCode = 0;
  } catch (err) {
    console.error(`probe FAIL: ${err.message}`);
    process.exitCode = 3;
  } finally {
    try {
      ws?.close();
    } catch {
      // closing a dead socket is not a failure
    }
    if (handle) await stopServe(handle);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    // Same courtesy as aec-sources-check: leave the dev profile pointing at the
    // tracked demo fixture, not at a directory that no longer exists.
    const finalReg = registerAecSources({});
    console.log(`== регистрация возвращена на: ${finalReg.projectJsonPath}`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) void run();
