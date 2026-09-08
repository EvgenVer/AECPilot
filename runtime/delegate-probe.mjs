// Живой прогон подагента (задача 3E.13, UR38).
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЗОНД. `kanban-probe.mjs` намерил, что набор `delegation`
// включён у десктопной сессии, — но «инструмент предложен модели» и «подагент
// действительно порождается, а его ответ возвращается в ленту» это разные
// утверждения, и verify задачи требует второго. Разница уже дважды оказывалась
// существенной в этой фазе: веб-поиск (3E.2) и браузер (3E.3) были предложены
// модели и не работали.
//
// ЧТО СЧИТАЕТСЯ ДОКАЗАТЕЛЬСТВОМ. Три вещи, все — из потока событий шлюза, то
// есть из того же источника, который питает ленту окна:
//   1. вызов `delegate_task` в событиях инструментов (агент действительно
//      делегировал, а не сделал сам);
//   2. события подагента (`subagent.*`) — их же поток, на котором держится
//      панель «Агенты» (`store/subagents.ts`);
//   3. текст ответа, в котором есть то, что мог узнать только подагент.
//
// Задача подагенту даётся такая, чтобы ответ нельзя было выдумать: считать
// строки в файле, который зонд только что создал во временной папке.
//
// Usage: node runtime/delegate-probe.mjs

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { connectWs, rpcCall } from "./gateway-client.mjs";
import { startServe, waitHealthy, stopServe } from "./serve.mjs";

const PORT = 18995;
const TURN_TIMEOUT_MS = 300000;

const MARKER = "РИГЕЛЬ-47";
const LINES = 12;

const vault = mkdtempSync(path.join(tmpdir(), "aec-delegate-probe-"));
const file = path.join(vault, "vedomost.txt");
writeFileSync(
  file,
  Array.from({ length: LINES }, (_, i) => `строка ${i + 1} ${i === 6 ? MARKER : ""}`).join("\n"),
  "utf-8"
);

const PROMPT = [
  "Поручи ПОДАГЕНТУ через инструмент delegate_task ровно одну подзадачу:",
  `прочитать файл vedomost.txt в текущей папке и назвать, в какой строке стоит слово ${MARKER}.`,
  "Сам файл не читай. Когда подагент ответит, повтори его ответ одной строкой."
].join(" ");

const handle = await startServe({ port: PORT });
let ws;

try {
  await waitHealthy(handle);
  ;({ ws } = await connectWs(handle.wsUrl));

  // rpcCall отдаёт КАДР целиком ({result} либо {error}), а не результат.
  const created = await rpcCall(ws, "session.create", { source: "desktop", cwd: vault });
  if (created.error) throw new Error(`session.create: ${JSON.stringify(created.error)}`);
  const sessionId = created.result.session_id;
  console.log(`сессия ${sessionId} в ${vault}`);

  // Свой сборщик событий, а не `collectTurn`: нужен ПОЛНЫЙ список типов, а не
  // только текст ответа — доказательство лежит именно в событиях инструментов
  // и подагентов.
  const seen = [];
  const toolNames = new Set();
  const subagentEvents = [];

  let answered = "";
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("подагент не закончил за 5 минут; ответ хода: " + answered.slice(0, 200))), TURN_TIMEOUT_MS);
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

      seen.push(evt.type);
      const payload = evt.payload || {};
      const name = payload.tool || payload.name || payload.tool_name;
      if (name) toolNames.add(String(name));
      if (String(evt.type).includes("subagent") || String(evt.type).includes("delegate")) {
        subagentEvents.push(`${evt.type} ${JSON.stringify(payload).slice(0, 160)}`);
      }

      // ХОД КОНЧАЕТСЯ РАНЬШЕ ПОДАГЕНТА, и это их устройство, а не сбой: их
      // `delegate_task` отдаёт управление сразу, а подагент работает в фоне
      // и присылает `subagent.complete` уже после ответа. Поэтому слушаем до
      // завершения ПОДАГЕНТА, а не до конца хода.
      if (evt.type === "message.complete") answered = payload.text ?? "";
      if (evt.type === "subagent.complete") {
        clearTimeout(timer);
        ws.removeEventListener("message", onMessage);
        resolve({ answered, result: payload });
      }
    };
    ws.addEventListener("message", onMessage);
  });

  await rpcCall(ws, "prompt.submit", { session_id: sessionId, text: PROMPT });
  const { answered: turnText, result } = await done;

  const counts = seen.reduce((acc, type) => ({ ...acc, [type]: (acc[type] ?? 0) + 1 }), {});
  console.log(`\nСОБЫТИЯ: ${JSON.stringify(counts)}`);
  console.log(`ИНСТРУМЕНТЫ: ${[...toolNames].join(", ") || "(ни одного)"}`);
  console.log(`  delegate_task вызван -> ${toolNames.has("delegate_task") ? "ДА" : "НЕТ"}`);
  console.log(`СОБЫТИЯ ПОДАГЕНТА: ${subagentEvents.length}`);
  for (const line of subagentEvents.slice(0, 8)) console.log(`  ${line}`);
  console.log("ОТВЕТ ХОДА: " + String(turnText).slice(0, 300));
  const summary = JSON.stringify(result);
  console.log("ОТВЕТ ПОДАГЕНТА: " + summary.slice(0, 700));
  console.log("  подагент назвал строку 7 -> " + (/(^|[^0-9])7([^0-9]|$)/.test(summary) ? "ДА" : "НЕТ"));

  await rpcCall(ws, "session.close", { session_id: sessionId }).catch(() => {});
} finally {
  ws?.close();
  await stopServe(handle);
  rmSync(vault, { recursive: true, force: true });
}
