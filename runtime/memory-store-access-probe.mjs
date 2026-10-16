// Задача 5.4 — МОЖНО ЛИ ЧИТАТЬ ХРАНИЛИЩЕ ПАМЯТИ ПРИ ЖИВОМ ЯДРЕ.
//
// ОТ ЭТОГО ЗАВИСИТ ВСЯ АРХИТЕКТУРА ЭКРАНА. Слой 1 — это два файла в профиле, их
// читает и пишет главный процесс напрямую. Слой 2 — встроенный qdrant, и у ядра
// нет ни одного HTTP-эндпойнта и ни одного RPC, который отдавал бы список фактов
// (проверено по их `gateway/`: есть `/api/memory` со статусом и размерами файлов,
// есть `/api/memory/reset`, списка нет). Значит остаётся читать хранилище своим
// процессом — и весь вопрос в том, даст ли встроенный qdrant открыть папку,
// которую уже держит ядро.
//
// ЕСЛИ ДАСТ — экран памяти обращается к слою 2 через короткий процесс python, как
// это уже делает эвал, и модель в этом не участвует.
// ЕСЛИ НЕ ДАСТ — список фактов в экране невозможен без нового места в ядре, и это
// решение владельца, а не моё.
//
// Запуск: node runtime/memory-store-access-probe.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { connectWs, rpcCall } from "./gateway-client.mjs";
import { PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";
import { applyMemoryProfile, memoryEnv } from "./memory-config.mjs";
import { HERMES_HOME_DIR, startServe, stopServe, waitHealthy } from "./serve.mjs";

const PORT = 18991;
const REPO_ROOT = path.resolve(RUNTIME_DIR, "..");
const HERMES_SRC = path.join(RUNTIME_DIR, ".hermes-src");

const PY = [
  "import json, os, sys",
  `sys.path.insert(0, r"${HERMES_SRC}")`,
  `sys.path.insert(0, r"${path.join(REPO_ROOT, "eval")}")`,
  "from pathlib import Path",
  "from graph_cost import load_env_file",
  `load_env_file(Path(r"${path.join(HERMES_HOME_DIR, ".env")}"))`,
  "from plugins.memory import load_memory_provider",
  "try:",
  "    p = load_memory_provider('mem0', register_skills=False)",
  "    p.initialize(session_id='access-probe', platform='tui', hermes_home=os.environ['HERMES_HOME'], agent_context='primary')",
  // Поиск зовётся их же обработчиком инструмента — тем самым, которым
  // пользовался бы экран памяти. Он НЕ бросает, а возвращает текст с ошибкой.
  "    out = p.handle_tool_call('mem0_search', {'query': 'резерв мощности', 'top_k': 5})",
  "    print('OPENED ' + json.dumps(out, ensure_ascii=False)[:400])",
  "except Exception as error:",
  "    print('REFUSED ' + type(error).__name__ + ': ' + str(error)[:400])",
].join("\n");

function runPython() {
  const file = path.join(os.tmpdir(), `aec-access-${Date.now()}.py`);
  fs.writeFileSync(file, PY, "utf-8");
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [file], {
      env: {
        ...process.env,
        HERMES_HOME: HERMES_HOME_DIR,
        // Пустышка для отказа без ключа: плагин Mem0 1.3.0 (T20.6) требует ключ при
        // создании бэкенда — без неё зонд упал бы раньше, чем дошёл до хранилища.
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || "probe-not-a-key",
        ...memoryEnv(HERMES_HOME_DIR),
        PYTHONIOENCODING: "utf-8",
      },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("close", () => {
      fs.rmSync(file, { force: true });
      resolve(out);
    });
  });
}

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "aec-access-vault-"));
const configPath = path.join(HERMES_HOME_DIR, "config.yaml");
const mem0Path = path.join(HERMES_HOME_DIR, "mem0.json");
const before = [configPath, mem0Path].map((file) => [
  file,
  fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null,
]);

applyMemoryProfile({ hermesHomeDir: HERMES_HOME_DIR, vaultPath: vault });

console.log("=== 1. БЕЗ живого ядра");
const alone = await runPython();
console.log(`   ${/(OPENED|REFUSED).*/.exec(alone)?.[0]?.slice(0, 260) ?? alone.trim().slice(-260)}`);

console.log("\n=== 2. ПРИ живом ядре (оно уже подняло провайдера своим ходом)");
const handle = await startServe({ port: PORT });
let ws;
try {
  await waitHealthy(handle);
  ({ ws } = await connectWs(handle.wsUrl));
  // Один ход нужен, чтобы ядро ДЕЙСТВИТЕЛЬНО открыло хранилище: провайдер
  // поднимается лениво, и без хода замер показал бы свободную папку.
  const created = await rpcCall(ws, "session.create", { source: "desktop", cwd: vault });
  const sessionId = created.result.session_id;
  await rpcCall(ws, "prompt.submit", {
    session_id: sessionId,
    text: "Запомни: резерв мощности на объекте 20 процентов.",
  });
  await new Promise((resolve) => setTimeout(resolve, 45000));

  const together = await runPython();
  console.log(
    `   ${/(OPENED|REFUSED).*/.exec(together)?.[0]?.slice(0, 260) ?? together.trim().slice(-260)}`
  );

  // ПРИГОВОР ПО СОДЕРЖИМОМУ ОТВЕТА, А НЕ ПО ТОМУ, КАКАЯ ВЕТКА НАПЕЧАТАЛАСЬ.
  //
  // Первая версия смотрела на метку `REFUSED`, то есть на исключение, — и соврала
  // ровно наоборот: их `handle_tool_call` исключение ГЛОТАЕТ и возвращает обычную
  // строку с полем `error` («Storage folder … is already accessed by another
  // instance of Qdrant client»). Ветка `except` не срабатывала, зонд печатал
  // «хранилище читается», а оно не читалось. Проверять надо результат.
  const refused =
    /REFUSED/.test(together) ||
    /already accessed|not initialized|Storage folder/i.test(together);
  console.log(
    refused
      ? "\nВЫВОД: при живом ядре своим процессом хранилище НЕ ОТКРЫТЬ.\n" +
          "       Обходов у нас нет, и это проверено, а не предположено:\n" +
          "       · HTTP-маршруты плагинов монтирует ИХ ПАНЕЛЬ (hermes_cli/web_server.py),\n" +
          "         а шлюз, с которым говорит приложение, её не поднимает вовсе;\n" +
          "       · RPC «позови инструмент по имени» у шлюза нет — инструменты зовёт модель;\n" +
          "       · второй клиент qdrant не откроет папку и ВНУТРИ того же процесса.\n" +
          "       Значит список фактов в экране требует решения владельца: либо qdrant\n" +
          "       сервером (а спека выбрала встроенный, без порта), либо новая поверхность."
      : "\nВЫВОД: хранилище читается и при живом ядре — экран памяти может обращаться к слою 2\n" +
          "       коротким процессом python, без участия модели."
  );
  await rpcCall(ws, "session.close", { session_id: sessionId }).catch(() => {});
} finally {
  if (ws) ws.close();
  await stopServe(handle);
  for (const [file, text] of before) {
    if (text === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, text, "utf-8");
  }
  fs.rmSync(vault, { recursive: true, force: true });
}
