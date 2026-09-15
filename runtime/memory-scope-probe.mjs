// Задача 5.1в — BDD «Изоляция проектов» на живой памяти, без ключа и без сети.
//
// ЧТО ПРОВЕРЯЕТСЯ. Факт, записанный в проекте A, не находится поиском в проекте
// B и находится в A. Проверяется НЕ нашим кодом: ход идёт через их собственный
// обработчик инструмента (`handle_tool_call('mem0_add' | 'mem0_search')`), то
// есть через их фильтр чтения (`filters={"user_id": …}` в `search`) и их встроенный qdrant. Наше
// участие кончается на `applyMemoryProfile` — том самом, которым приложение
// настраивает профиль при открытии проекта.
//
// ПОЧЕМУ БЕЗ КЛЮЧА. Их `mem0_add` зовёт `add(..., infer=False)` — извлечение
// фактов моделью выключено, нужен только ЭМБЕДДЕР. А адрес эмбеддера у нас
// настраиваемый (задача 5.1а), поэтому зонд поднимает свой: обычный HTTP на
// петле, отвечающий на `POST /v1/embeddings`. Ни чужого ключа, ни сети, ни
// денег — и «ушло наружу» здесь невозможно в принципе.
//
// ЭМБЕДДЕР ОТДАЁТ ОДИН И ТОТ ЖЕ ВЕКТОР на любой текст, и это НАРОЧНО. Проверяется
// ИЗОЛЯЦИЯ, а не релевантность: при одинаковых векторах всё, что вернул поиск,
// вернулось по ФИЛЬТРУ, а не по близости. Если бы вектор зависел от текста, пустой
// ответ в проекте B можно было бы объяснить «не похоже», и проверка доказывала бы
// ничего.
//
// ПЕРСИСТЕНТНОСТЬ — БЕСПЛАТНО: запись и чтение идут РАЗНЫМИ процессами python,
// так что найденный в третьем шаге факт переживает не только смену проекта, но и
// перезапуск.
//
// Запуск: node runtime/memory-scope-probe.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { PYTHON_BIN, RUNTIME_DIR } from "./hermes-env.mjs";
import { applyMemoryProfile, memoryEnv } from "./memory-config.mjs";

const HERMES_SRC = path.join(RUNTIME_DIR, ".hermes-src");
const FACT = "заказчик просил закладывать резерв мощности 20 процентов";
const QUERY = "резерв мощности";
const DIMS = 1536;

/** Один и тот же вектор на любой вход — см. шапку. */
const VECTOR = Array.from({ length: DIMS }, (_, i) => (i === 0 ? 1 : 0));

function startFakeEmbedder() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!req.url?.includes("/embeddings")) {
        res.writeHead(404).end("{}");
        return;
      }
      let count = 1;
      try {
        const input = JSON.parse(body).input;
        count = Array.isArray(input) ? input.length : 1;
      } catch {
        // не наш формат — ответим одним вектором
      }
      const payload = {
        object: "list",
        model: "text-embedding-3-small",
        data: Array.from({ length: count }, (_, index) => ({
          object: "embedding",
          index,
          embedding: VECTOR,
        })),
        usage: { prompt_tokens: 1, total_tokens: 1 },
      };
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(payload));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/v1` });
    });
  });
}

const PY = [
  "import json, os, sys",
  `sys.path.insert(0, r"${HERMES_SRC}")`,
  "from plugins.memory import load_memory_provider",
  "p = load_memory_provider('mem0', register_skills=False)",
  "p.initialize(session_id='probe', platform='tui', hermes_home=os.environ['HERMES_HOME'], agent_context='primary')",
  // 0.21.2 (задача 3.B4): их `_read_filters()` растворён в вызове поиска —
  // `search(query, filters={"user_id": self._user_id}, …)` (`plugins/memory/mem0/__init__.py`).
  // Печатаем ровно тот словарь, что уходит в поиск, из того же поля.
  "print('FILTER ' + json.dumps({'user_id': p._user_id}, ensure_ascii=False))",
  "action = sys.argv[1]",
  "if action == 'add':",
  `    print('RESULT ' + p.handle_tool_call('mem0_add', {'content': ${JSON.stringify(FACT)}}))`,
  "else:",
  `    print('RESULT ' + p.handle_tool_call('mem0_search', {'query': ${JSON.stringify(QUERY)}, 'top_k': 10}))`,
].join("\n");

/** Ответ приезжает с экранированной кириллицей: их `json.dumps` зовётся с
 *  умолчательным `ensure_ascii`, и факт выглядит как `за...`.
 *
 *  РАСКРЫТИЕ ЗДЕСЬ — НЕ КОСМЕТИКА. Без него ГЛАВНАЯ проверка зонда (в проекте B
 *  факта нет) прошла бы и при утечке: искомой строки в экранированном тексте нет
 *  никогда. Проверка, которая не может провалиться, не проверяет ничего. */
function decode(result) {
  try {
    return JSON.stringify(JSON.parse(result));
  } catch {
    return result;
  }
}

/** Python запускается АСИНХРОННО, и это не стиль, а необходимость.
 *
 *  ПЕРВАЯ ВЕРСИЯ ЗОНДА ВИСЛА НАСМЕРТЬ (замерено: 12 минут без единой строки).
 *  `spawnSync` блокирует событийный цикл node — тот самый, в котором живёт наш
 *  фальшивый эмбеддер. Python ждал ответа на `POST /v1/embeddings`, ответить
 *  было некому, и клиент OpenAI досиживал свой шестисотсекундный таймаут по
 *  два раза на попытку. Сервер и его клиент не могут делить один поток. */
function runPython(scriptPath, action, home) {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [scriptPath, action], {
      env: {
        ...process.env,
        HERMES_HOME: home,
        // Клиент OpenAI отказывается строиться с пустым ключом. Значение
        // заведомо негодное и уходит только на нашу же петлю.
        OPENAI_API_KEY: "probe-not-a-key",
        ...memoryEnv(home),
        PYTHONIOENCODING: "utf-8",
      },
    });

    let text = "";
    child.stdout.on("data", (chunk) => (text += chunk.toString()));
    child.stderr.on("data", (chunk) => (text += chunk.toString()));
    child.on("close", () => {
      resolve({
        filter: /FILTER (.+)/.exec(text)?.[1] ?? "(фильтр не напечатан)",
        result: /RESULT (.+)/.exec(text)?.[1] ?? text.trim().slice(0, 400),
      });
    });
  });
}

async function main() {
  const { server, url } = await startFakeEmbedder();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aec-mem-scope-home-"));
  const vaultA = fs.mkdtempSync(path.join(os.tmpdir(), "aec-vault-A-"));
  const vaultB = fs.mkdtempSync(path.join(os.tmpdir(), "aec-vault-B-"));
  const scriptPath = path.join(home, "probe.py");
  fs.writeFileSync(scriptPath, PY, "utf-8");

  console.log(`эмбеддер зонда: ${url}`);
  console.log(`профиль: ${home}`);

  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? "OK  " : "ПЛОХО"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures += 1;
  };

  // Шаг 1. Проект A открыт, факт записан.
  const keyA = applyMemoryProfile({
    hermesHomeDir: home,
    vaultPath: vaultA,
    env: { OPENAI_BASE_URL: url },
  }).key;
  const added = await runPython(scriptPath, "add", home);
  console.log(`\n== проект A (${keyA})`);
  console.log(`   фильтр чтения: ${added.filter}`);
  console.log(`   запись: ${added.result}`);
  check("факт записан", added.result.includes("Fact stored"), added.result.slice(0, 160));

  // Шаг 2. Открыт проект B — ДРУГОЙ процесс, другой ключ, тот же профиль.
  const keyB = applyMemoryProfile({
    hermesHomeDir: home,
    vaultPath: vaultB,
    env: { OPENAI_BASE_URL: url },
  }).key;
  const inB = await runPython(scriptPath, "search", home);
  console.log(`\n== проект B (${keyB})`);
  console.log(`   фильтр чтения: ${inB.filter}`);
  console.log(`   поиск: ${decode(inB.result).slice(0, 200)}`);
  check("ключи проектов разные", keyA !== keyB, `${keyA} / ${keyB}`);
  check(
    "факт проекта A в проекте B НЕ находится",
    !decode(inB.result).includes("резерв мощности"),
    decode(inB.result).slice(0, 160)
  );

  // Шаг 3. Вернулись в проект A — третий процесс. Это же и персистентность.
  applyMemoryProfile({ hermesHomeDir: home, vaultPath: vaultA, env: { OPENAI_BASE_URL: url } });
  const backInA = await runPython(scriptPath, "search", home);
  console.log(`\n== снова проект A`);
  console.log(`   поиск: ${decode(backInA.result).slice(0, 200)}`);
  check(
    "факт находится в своём проекте и после перезапуска",
    decode(backInA.result).includes("резерв мощности"),
    decode(backInA.result).slice(0, 160)
  );

  server.close();
  console.log(`\n${failures === 0 ? "ИЗОЛЯЦИЯ ДЕРЖИТСЯ" : `ПРОВАЛОВ: ${failures}`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
