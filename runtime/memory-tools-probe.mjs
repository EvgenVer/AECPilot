// Какой СЛОЙ выбирает агент для факта о человеке (задача 5.6, сценарий 3).
//
// ПОЧЕМУ НЕ СПИСОК ИНСТРУМЕНТОВ СЕССИИ. Первый подход спрашивал у `session.create`
// поле `tools` — и получил `{}` при `lazy: true`: список набирается лениво, на
// первом ходу. Замер через него показывал бы «инструментов нет» всегда.
//
// Поэтому смотрится ДЕЛО, а не объявление: какие инструменты агент реально
// позвал, когда его попросили запомнить факт о человеке. Это же и есть вопрос
// сценария 3 — ушёл ли факт в слой 1 (`memory`) или в слой 2 (`mem0_add`).
//
// Запуск: node runtime/memory-tools-probe.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { connectWs, rpcCall } from "./gateway-client.mjs";
import { applyMemoryProfile } from "./memory-config.mjs";
import { HERMES_HOME_DIR, startServe, stopServe, waitHealthy } from "./serve.mjs";

const TURN_TIMEOUT_MS = 240000;
const PROMPT = "Запомни про меня: я веду раздел отопления и вентиляции, отвечай мне короче.";

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "aec-mem-tools-"));
fs.writeFileSync(
  path.join(vault, "AGENTS.md"),
  fs
    .readFileSync(path.join(import.meta.dirname, "templates", "AGENTS.md"), "utf-8")
    .replaceAll("{{PROJECT_NAME}}", "Замер слоёв"),
  "utf-8"
);
applyMemoryProfile({ hermesHomeDir: HERMES_HOME_DIR, vaultPath: vault });

const handle = await startServe({ port: 18992 });
let ws;
try {
  await waitHealthy(handle);
  ({ ws } = await connectWs(handle.wsUrl));
  const created = await rpcCall(ws, "session.create", { source: "desktop", cwd: vault });
  const sessionId = created.result.session_id;

  const toolNames = new Set();
  let answer = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ход не закончился")), TURN_TIMEOUT_MS);
    const onMessage = (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.method !== "event") return;
      const evt = frame.params || {};
      if (evt.session_id && evt.session_id !== sessionId) return;
      const payload = evt.payload || {};
      const name = payload.tool || payload.name || payload.tool_name;
      if (name) toolNames.add(String(name));
      if (evt.type === "message.complete") {
        answer = payload.text ?? "";
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolve();
      }
    };
    ws.addEventListener("message", onMessage);
    rpcCall(ws, "prompt.submit", { session_id: sessionId, text: PROMPT });
  });

  console.log(`\nинструменты хода: ${[...toolNames].join(", ") || "(ни одного)"}`);
  console.log(`  слой 1 (memory) -> ${toolNames.has("memory") ? "ПОЗВАН" : "не позван"}`);
  console.log(`  слой 2 (mem0_add) -> ${toolNames.has("mem0_add") ? "ПОЗВАН" : "не позван"}`);
  console.log(`ответ: ${answer.slice(0, 200)}`);

  const notes = path.join(HERMES_HOME_DIR, "memories");
  console.log(
    `\nфайлы записки: ${fs.existsSync(notes) ? fs.readdirSync(notes).join(", ") || "(папка пуста)" : "(папки нет)"}`
  );
  await rpcCall(ws, "session.close", { session_id: sessionId }).catch(() => {});
} finally {
  if (ws) ws.close();
  await stopServe(handle);
  fs.rmSync(vault, { recursive: true, force: true });
}
