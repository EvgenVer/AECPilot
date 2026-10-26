// Замер для задачи 3E.13 (UR38): доска задач, подагенты, точки возврата.
//
// ЗАЧЕМ ЗАМЕР, А НЕ ЧТЕНИЕ. Verify задачи говорит «проверено прогоном, а не
// чтением», и на то есть причина из прошлого опыта фазы: и веб-поиск (3E.2), и
// браузер (3E.3), и исполнение кода (3E.8) выглядели работающими по коду и не
// работали живьём. Здесь три разных механизма, и каждый может отсутствовать
// по-своему:
//
//   1. ДОСКА. Её интерфейс — их плагин рендерера, а данные — FastAPI-роутер
//      ЯДРА (`plugins/kanban/dashboard/plugin_api.py`), который существует
//      только когда плагин включён. Проба 1.6.B2a.1 намерила «80 плагинов, ни
//      одного активного» — то есть по умолчанию роутера нет, и перенос
//      интерфейса без включения плагина дал бы пустой экран с ошибкой сети.
//   2. ПОДАГЕНТЫ. `delegate_task` — инструмент ядра; вопрос не «есть ли файл»,
//      а входит ли он в набор, который получает ДЕСКТОПНАЯ сессия.
//   3. ТОЧКИ ВОЗВРАТА. У нас уже есть и контракт (`docs/history/specs/checkpoints-rollback.md`),
//      и экран (задача 1.6.C2). Здесь проверяется третий глагол — `restore`:
//      список и различия мы видели, а откат ни разу не выполнялся.
//
// Что делает: поднимает `hermes serve` нашим же путём, спрашивает список
// плагинов, включает `kanban` (и ВОЗВРАЩАЕТ прежнее состояние в finally),
// стучится в его REST-роутер, читает набор инструментов десктопной сессии и
// проверяет откат на выброшенной временной папке.
//
// Ничего в проекте владельца не трогает: работает во временной папке, свой
// снимок откатывает сам.
//
// Usage: node runtime/kanban-probe.mjs

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { HERMES_HOME_DIR, PYTHON_ARGS, PYTHON_BIN } from "./hermes-env.mjs";
import { startServe, waitHealthy, stopServe } from "./serve.mjs";

// Снимок берётся ИХ ЖЕ методом: `hermes checkpoints` не умеет снять состояние
// произвольной папки, а гонять ради этого агента с моделью незачем.
const FORCE_PY = [
  "import json",
  "import sys",
  "from tools.checkpoint_manager import CheckpointManager",
  "mgr = CheckpointManager(enabled=True)",
  "print(json.dumps({\"taken\": mgr.ensure_checkpoint(sys.argv[1], reason=sys.argv[2])}))"
].join(String.fromCharCode(10));

function forceCheckpoint(dir, reason) {
  const helper = path.join(tmpdir(), `aec-force-${process.pid}.py`);
  writeFileSync(helper, FORCE_PY, "utf-8");
  try {
    const result = spawnSync(PYTHON_BIN, [...PYTHON_ARGS, helper, dir, reason], {
      env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR },
      encoding: "utf8"
    });
    if (result.status !== 0) {
      return { error: (result.stderr || result.stdout || "").trim().slice(-300) };
    }
    return JSON.parse(result.stdout.trim());
  } finally {
    rmSync(helper, { force: true });
  }
}

const usedTools = new Set();
const PORT = 18996;
const RPC_TIMEOUT_MS = 60000;

function connect(handle) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(handle.wsUrl);
    const pending = new Map();
    let nextId = 1;
    ws.addEventListener("open", () =>
      resolve({
        request(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`${method} timed out`));
            }, RPC_TIMEOUT_MS);
            pending.set(id, { res, rej, timer });
          });
        },
        close: () => ws.close(),
        ws
      })
    );
    ws.addEventListener("error", () => reject(new Error("websocket failed")));
    ws.addEventListener("message", (event) => {
      for (const line of String(event.data).split("\n")) {
        if (!line.trim()) continue;
        let frame;
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }
        const entry = frame.id !== undefined && pending.get(frame.id);
        if (!entry) continue;
        clearTimeout(entry.timer);
        pending.delete(frame.id);
        if (frame.error) entry.rej(new Error(`${frame.error.code}: ${frame.error.message}`));
        else entry.res(frame.result);
      }
    });
  });
}

// Тот же заголовок, которым ходит наш главный процесс
// (`main/hermes-rest-pure.ts::SESSION_TOKEN_HEADER`) — не `Authorization`.
async function rest(handle, route, cap = 400) {
  const url = `http://${handle.host}:${handle.port}${route}`;
  const response = await fetch(url, {
    headers: { "X-Hermes-Session-Token": handle.token, Accept: "application/json" }
  });
  const text = await response.text();
  return { status: response.status, body: text.slice(0, cap) };
}

const handle = await startServe({ port: PORT });
let rpc;
let kanbanWasEnabled = null;
const vault = mkdtempSync(path.join(tmpdir(), "aec-kanban-probe-"));

try {
  await waitHealthy(handle);
  rpc = await connect(handle);

  // --- 1. Доска: есть ли плагин и включён ли он ------------------------------
  const listing = await rpc.request("plugins.manage", { action: "list" });
  const rows = listing.plugins ?? [];
  const kanban = rows.find((row) => row.name === "kanban");

  console.log(`ПЛАГИНЫ: ${rows.length} шт.`);
  console.log(`  kanban -> ${kanban ? `есть, status=${kanban.status}` : "НЕТ В СПИСКЕ"}`);

  const beforeEnable = await rest(handle, "/api/plugins/kanban/board");
  console.log(`  /api/plugins/kanban/board ДО включения -> ${beforeEnable.status}`);
  console.log(`     ${beforeEnable.body.replace(/\s+/g, " ").slice(0, 300)}`);
  const boards = await rest(handle, "/api/plugins/kanban/boards");
  console.log(`  /api/plugins/kanban/boards -> ${boards.status} ${boards.body.replace(/\s+/g, " ").slice(0, 200)}`);
  console.log(`  имена плагинов: ${rows.map((r) => r.name).join(", ").slice(0, 400)}`);

  if (kanban) {
    kanbanWasEnabled = kanban.status === "enabled";
    if (!kanbanWasEnabled) {
      const toggled = await rpc.request("plugins.manage", {
        action: "toggle",
        name: "kanban",
        enable: true
      });
      console.log(`  включение -> ok=${toggled.ok} status=${toggled.plugin?.status}`);
    }

    const afterEnable = await rest(handle, "/api/plugins/kanban/board");
    console.log(`  /api/plugins/kanban/board ПОСЛЕ включения -> ${afterEnable.status}`);
    console.log(`     ${afterEnable.body.replace(/\s+/g, " ").slice(0, 200)}`);
  }

  // --- 2. Инструменты десктопной сессии --------------------------------------
  mkdirSync(path.join(vault, "wiki"), { recursive: true });
  const file = path.join(vault, "wiki", "smeta.md");
  writeFileSync(file, "первая строка\n", "utf-8");

  const session = await rpc.request("session.create", { source: "desktop", cwd: vault });
  console.log(`
session.info ключи: ${Object.keys(session.info ?? {}).join(", ")}`);
  console.log(`session.create ключи: ${Object.keys(session).join(", ")}`);
  const tools = Object.keys(session.info?.tools ?? {});
  const kanbanTools = tools.filter((name) => name.startsWith("kanban"));

  console.log(`\nИНСТРУМЕНТЫ десктопной сессии: ${tools.length}`);
  console.log(`  kanban_* -> ${kanbanTools.length ? kanbanTools.join(", ") : "НЕТ НИ ОДНОГО"}`);
  for (const name of ["delegate_task", "checkpoint_manager", "list_checkpoints", "rollback"]) {
    console.log(`  ${name} -> ${tools.includes(name) ? "есть" : "нет"}`);
  }

  // --- 3. Точки возврата: третий глагол, который ни разу не выполнялся --------
  const listed = await rpc
    .request("rollback.list", { session_id: session.session_id })
    .catch((error) => ({ error: String(error) }));
  console.log(`\nrollback.list -> ${JSON.stringify(listed).slice(0, 200)}`);

  // Снимок нужно СОЗДАТЬ: в свежей папке агент ещё не писал, и списку неоткуда
  // взяться. Берём его их же методом (`ensure_checkpoint`, как проба 1.6.C1),
  // а откат делаем НАШИМ путём — тем самым RPC, который зовёт экран.
  console.log(`ensure_checkpoint -> ${JSON.stringify(forceCheckpoint(vault, "проба 3E.13"))}`);

  const after = await rpc
    .request("rollback.list", { session_id: session.session_id })
    .catch((error) => ({ error: String(error) }));
  const checkpoints = after.checkpoints ?? [];
  console.log(`rollback.list после снимка -> ${checkpoints.length} шт.`);

  if (checkpoints.length > 0) {
    writeFileSync(file, "вторая строка", "utf-8");
    console.log(`файл ИЗМЕНЁН: ${JSON.stringify(readFileSync(file, "utf-8"))}`);

    const restored = await rpc
      .request("rollback.restore", {
        session_id: session.session_id,
        hash: checkpoints[0].hash
      })
      .catch((error) => ({ error: String(error) }));
    console.log(`rollback.restore -> ${JSON.stringify(restored).slice(0, 300)}`);
    console.log(`файл ПОСЛЕ отката: ${JSON.stringify(readFileSync(file, "utf-8"))}`);
  } else {
    console.log("снимка не появилось — откатывать нечего");
  }


  // --- 4. Агент управляет доской ---------------------------------------------
  // Инструменты у него есть (набор `kanban` включён выше). Остаётся
  // единственный вопрос, который читанием не закрывается: ДОХОДИТ ЛИ его
  // вызов до той же доски, которую показывает интерфейс. Проверяется
  // сквозным способом: агент создаёт задачу, а мы ищем её в REST-ответе,
  // из которого рисуется экран.
  const title = `Замер 3E.13 ${Date.now()}`;
  const turn = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ход не закончился за 5 минут")), 300000);
    const onMessage = (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.method !== "event") return;
      const evt = frame.params || {};
      if (evt.session_id && evt.session_id !== session.session_id) return;
      const name = evt.payload?.tool || evt.payload?.name;
      if (name) usedTools.add(String(name));
      if (evt.type === "message.complete") {
        clearTimeout(timer);
        rpc.ws.removeEventListener("message", onMessage);
        resolve(evt.payload?.text ?? "");
      }
    };
    rpc.ws.addEventListener("message", onMessage);
    rpc.ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 9001,
        method: "prompt.submit",
        params: {
          session_id: session.session_id,
          text: `Создай на доске канбан задачу с заголовком «${title}» инструментом kanban_create. Больше ничего не делай.`
        }
      })
    );
  });

  console.log(`
ход агента: ${String(turn).slice(0, 200)}`);
  console.log(`  инструменты хода: ${[...usedTools].join(", ") || "(ни одного)"}`);

  const board = await rest(handle, "/api/plugins/kanban/board", 20000);
  console.log(`  доска после хода -> ${board.status}, задача найдена: ${board.body.includes(title) ? "ДА" : "НЕТ"}`);
  if (!board.body.includes(title)) {
    const full = await rest(handle, "/api/plugins/kanban/board", 20000);
    console.log(`  (полный ответ доски: ${full.body.replace(/\s+/g, " ").slice(0, 300)})`);
  }

  await rpc.request("session.close", { session_id: session.session_id }).catch(() => {});
} finally {
  if (rpc && kanbanWasEnabled === false) {
    // Профиль владельца не должен остаться с включённым плагином из-за пробы.
    const restored = await rpc
      .request("plugins.manage", { action: "toggle", name: "kanban", enable: false })
      .catch((error) => ({ error: String(error) }));
    console.log(`\nвосстановлено: kanban -> ${JSON.stringify(restored).slice(0, 120)}`);
  }
  rpc?.close();
  await stopServe(handle);
  rmSync(vault, { recursive: true, force: true });
}
