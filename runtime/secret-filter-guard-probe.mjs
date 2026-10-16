// Задача T20.10: живая проверка сторожа загрузки фильтра секретов.
//
// Главный процесс перед первым ходом сессии спрашивает у ядра команду
// `aec-filter-status` — последнюю регистрацию нашего фильтра
// (`plugins/aec_secret_filter/__init__.py`, `main/secret-filter-guard-pure.ts`).
// Здесь замеряются обе ветки на настоящем ядре:
//   1. фильтр включён — команда отвечает `aec-secret-filter: loaded`;
//   2. фильтр выключен в профиле — ядро команды не знает и отвечает быстро
//      (не виснет), без маркера.
//
// Вторая ветка ПРАВИТ config.yaml профиля, поэтому проба работает только на
// временной копии (`AEC_HERMES_HOME` с префиксом `aecpilot-acceptance-profile-`,
// как её готовит e2e/lib/core.ts) и отказывается на любом другом профиле — урок
// T20.9, когда пробы без `AEC_HERMES_HOME` писали в профиль ручной приёмки.
//
// Usage: AEC_HERMES_HOME=<временная копия runtime/e2e-profile> node runtime/secret-filter-guard-probe.mjs
// Модели не нужно — только RPC.

import fs from "node:fs";
import path from "node:path";

const HOME = process.env.AEC_HERMES_HOME ?? "";
if (!HOME.includes("aecpilot-acceptance-profile-")) {
  console.error("refusing: AEC_HERMES_HOME must be a temporary copy (aecpilot-acceptance-profile-*)");
  process.exit(2);
}

const { startServe, waitHealthy, stopServe } = await import("./serve.mjs");

const STATUS_COMMAND = "aec-filter-status";
const LOADED = "aec-secret-filter: loaded";

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
  async function call(method, params, timeoutMs = 180000) {
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

async function askStatus(label) {
  const handle = await startServe();
  let rpc;
  try {
    await waitHealthy(handle);
    rpc = createRpcClient(handle.wsUrl);
    const created = await rpc.call("session.create", { source: "aecpilot-filter-guard-probe" });
    const sessionId = created.result?.session_id;
    const started = Date.now();
    const frame = await rpc.call("command.dispatch", { name: STATUS_COMMAND, arg: "", session_id: sessionId });
    const ms = Date.now() - started;
    const output = typeof frame.result?.output === "string" ? frame.result.output.trim() : null;
    const error = frame.error ? `${frame.error.code}: ${frame.error.message}` : null;
    console.log(`${label}: output=${JSON.stringify(output)} error=${JSON.stringify(error)} [${ms} ms]`);
    return { loaded: output === LOADED, ms };
  } finally {
    rpc?.close();
    await stopServe(handle);
  }
}

const configPath = path.join(HOME, "config.yaml");
let failed = false;

const on = await askStatus("filter enabled");
if (!on.loaded) {
  console.log("FAIL: the loaded filter does not answer its status command");
  failed = true;
}

// Ветка 2: тот же профиль без фильтра в plugins.enabled.
const original = fs.readFileSync(configPath, "utf-8");
const without = original
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "- aec-secret-filter")
  .join("\n");
if (without === original.replace(/\r\n/g, "\n")) {
  console.log("FAIL: aec-secret-filter is not listed in plugins.enabled — cannot build the negative case");
  failed = true;
} else {
  fs.writeFileSync(configPath, without, "utf-8");
  try {
    const off = await askStatus("filter disabled");
    if (off.loaded) {
      console.log("FAIL: status says loaded with the filter disabled");
      failed = true;
    }
    if (off.ms > 60000) {
      console.log("FAIL: the refusal took longer than a minute");
      failed = true;
    }
  } finally {
    fs.writeFileSync(configPath, original, "utf-8");
  }
}

console.log(failed ? "RESULT: FAIL" : "RESULT: PASS — status answers only when the filter is loaded");
process.exit(failed ? 1 : 0);
