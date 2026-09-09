// Задача 5.6 — smoke-эвал памяти: пять сценариев спеки на живом агенте.
//
// ПОЧЕМУ .mjs В ПАПКЕ, ГДЕ ОСТАЛЬНОЕ НА PYTHON. Мерить надо ПОВЕДЕНИЕ АГЕНТА, а
// не работу библиотеки: вопрос «попал ли факт в правильный слой» про то, что
// сделает модель, а не про то, что умеет mem0. Агент живёт за шлюзом, и весь
// подъём шлюза, сессии и сбор хода у нас уже написаны — `runtime/serve.mjs` и
// `runtime/gateway-client.mjs`. Переписывать их на python ради единообразия
// папки значило бы завести второй такой же код, который никто не проверяет.
//
// ЧТО ПРОВЕРЯЕТСЯ (`specs/agent-memory.md` §«Feature-level acceptance»):
//   1. проектный факт запоминается и ВЛИЯЕТ НА ОТВЕТ в новой сессии (recall);
//   2. уточнённое значение вытесняет прежнее (консолидация противоречия);
//   3. факт о ЧЕЛОВЕКЕ уходит в слой 1 — в записку профиля на диске;
//   4. секрет не сохраняется ни в одном слое;
//   5. удалённый факт больше не участвует в recall.
//
// КАЖДОЕ ЧТЕНИЕ — В НОВОЙ СЕССИИ, и это несущее условие, а не аккуратность: в той
// же сессии факт стоит в окне разговора, и «ответ согласуется с памятью» прошло
// бы даже при пустой памяти. Новая сессия оставляет памяти единственный канал.
//
// СУДЬИ НЕТ, И ОН НЕ НУЖЕН. Все пять проверок механические: число в ответе, текст
// в файле записки, отсутствие значения секрета. Судья понадобился бы для оценки
// формулировок — здесь оцениваются факты.
//
// ПРОФИЛЬ — РАБОЧИЙ (`runtime/dev-profile`), потому что ключ модели живёт в нём и
// потому что мерить надо то, что поедет у человека. Хранилище памяти при этом
// отделено: эвал открывает СВОЙ vault, а скоуп проекта считается от его пути
// (задача 5.2), так что факты эвала не смешиваются с фактами настоящих проектов.
// `config.yaml` и `mem0.json` профиля снимаются до прогона и возвращаются после.
//
// Запуск: node eval/memory_smoke.mjs   (пишет eval/reports/memory-smoke.json)

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { collectTurn, connectWs, rpcCall } from "../runtime/gateway-client.mjs";
import { PYTHON_BIN } from "../runtime/hermes-env.mjs";
import { applyMemoryProfile } from "../runtime/memory-config.mjs";
import { installSecretFilter } from "../runtime/register-secret-filter.mjs";
import { HERMES_HOME_DIR, startServe, stopServe, waitHealthy } from "../runtime/serve.mjs";

const PORT = 18993;
const TURN_TIMEOUT_MS = 240000;
// Автозапись хода уходит в фон ДВАЖДЫ (исполнитель воронки, затем поток
// провайдера) и внутри зовёт модель на извлечение фактов. Без паузы следующий
// вопрос задаётся раньше, чем факт лёг, и эвал мерил бы скорость, а не память.
const SETTLE_MS = 30000;

const REPORT = path.join(import.meta.dirname, "reports", "memory-smoke.json");

const SECRET = "Qwerty12345!";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Снимок файлов профиля, которые прогон меняет: настройка памяти и ЗАПИСКА СЛОЯ 1.
 *
 *  Записка здесь не для порядка. Без неё прогон оставляет в профиле человека свой
 *  факт («веду раздел ОВ»), и СЛЕДУЮЩИЙ прогон видит его как «было до нас» —
 *  сценарий 3 проваливается на ровном месте, потому что проверяет появление того,
 *  что уже лежит. Одна из двух причин, по которым первый прогон этого эвала соврал. */
function snapshotProfile() {
  const files = ["config.yaml", "mem0.json", "memories/MEMORY.md", "memories/USER.md"];
  return files.map((name) => {
    const file = path.join(HERMES_HOME_DIR, name);
    return { file, before: fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null };
  });
}

function restoreProfile(snapshot) {
  for (const { file, before } of snapshot) {
    if (before === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, before, "utf-8");
  }
}

function readLayerOne() {
  const dir = path.join(HERMES_HOME_DIR, "memories");
  return ["MEMORY.md", "USER.md"]
    .map((name) => {
      const file = path.join(dir, name);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
    })
    .join("\n");
}

/** Кладёт в vault эвала ТЕ ЖЕ проектные правила, что кладёт приложение.
 *
 *  ПЕРВЫЙ ПРОГОН БЕЗ ЭТОГО ПРОВАЛИЛ СЦЕНАРИЙ 3, и провалил справедливо: в пустой
 *  папке не было `AGENTS.md`, то есть правила «факт о человеке — в слой 1, факт о
 *  проекте — в слой 2» (задача 5.5) агент не видел вовсе. Мерить агента без
 *  правил, с которыми он поедет у человека, значит мерить не тот агент. */
function writeProjectRules(vault) {
  const template = fs.readFileSync(
    path.join(import.meta.dirname, "..", "runtime", "templates", "AGENTS.md"),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(vault, "AGENTS.md"),
    template.replaceAll("{{PROJECT_NAME}}", "Эвал памяти"),
    "utf-8"
  );
}

/** Поиск по хранилищу слоя 2 БЕЗ агента — отдельным процессом python на venv ядра.
 *
 *  Нужен там, где спрашивать агента нельзя: ответ модели это её формулировка, а
 *  вопрос «лежит ли факт в хранилище» требует посмотреть в хранилище. Ключ берётся
 *  программно из `.env` профиля (нужен эмбеддер), значение не печатается. */
function searchStore(query) {
  const script = [
    "import json, os, sys",
    `sys.path.insert(0, r"${path.join(import.meta.dirname, "..", "runtime", ".hermes-src")}")`,
    `sys.path.insert(0, r"${import.meta.dirname}")`,
    "from pathlib import Path",
    "from graph_cost import load_env_file",
    `load_env_file(Path(r"${path.join(HERMES_HOME_DIR, ".env")}"))`,
    "from plugins.memory import load_memory_provider",
    "p = load_memory_provider('mem0', register_skills=False)",
    "p.initialize(session_id='eval-read', platform='tui', hermes_home=os.environ['HERMES_HOME'], agent_context='primary')",
    `print('FOUND ' + json.dumps(p.handle_tool_call('mem0_search', {'query': ${JSON.stringify(query)}, 'top_k': 20}), ensure_ascii=False))`,
  ].join("\n");

  const file = path.join(os.tmpdir(), `aec-eval-read-${Date.now()}.py`);
  fs.writeFileSync(file, script, "utf-8");

  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, [file], {
      env: {
        ...process.env,
        HERMES_HOME: HERMES_HOME_DIR,
        MEM0_TELEMETRY: "false",
        PYTHONIOENCODING: "utf-8",
      },
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("close", () => {
      fs.rmSync(file, { force: true });
      const line = /FOUND (.+)/.exec(out)?.[1];
      if (!line) {
        resolve(out.trim().slice(-400));
        return;
      }
      try {
        resolve(JSON.stringify(JSON.parse(JSON.parse(line))));
      } catch {
        resolve(line);
      }
    });
  });
}

async function main() {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), "aec-memory-eval-vault-"));
  writeProjectRules(vault);
  const snapshot = snapshotProfile();
  const { key } = applyMemoryProfile({ hermesHomeDir: HERMES_HOME_DIR, vaultPath: vault });
  installSecretFilter(HERMES_HOME_DIR);

  const layerOneBefore = readLayerOne();
  const results = [];
  const record = (id, scenario, passed, detail) => {
    results.push({ id, scenario, passed, detail });
    console.log(`${passed ? "OK   " : "ПЛОХО"} ${id}. ${scenario}${detail ? ` — ${detail}` : ""}`);
  };

  const handle = await startServe({ port: PORT });
  let ws;
  let deleteAnswer = "";
  try {
    await waitHealthy(handle);
    ({ ws } = await connectWs(handle.wsUrl));

    // ИМЕНА ИНСТРУМЕНТОВ ХОДА СОБИРАЮТСЯ ВСЕГДА. Первый прогон провалил сценарий 3
    // с диагнозом «записка не изменилась» — и по этой строке нельзя было понять,
    // агент выбрал другой слой или запись сорвалась. Теперь в отчёте видно, что он
    // позвал.
    const lastTools = new Set();
    const watchTools = (event) => {
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.method !== "event") return;
      const payload = frame.params?.payload || {};
      const name = payload.tool || payload.name || payload.tool_name;
      if (name) lastTools.add(String(name));
    };
    ws.addEventListener("message", watchTools);

    /** Один ход в СВОЕЙ сессии. Лог хода подавлен — интересен только текст. */
    const say = async (text) => {
      lastTools.clear();
      const created = await rpcCall(ws, "session.create", { source: "desktop", cwd: vault });
      if (created.error) throw new Error(`session.create: ${JSON.stringify(created.error)}`);
      const sessionId = created.result.session_id;
      const turn = await collectTurn(ws, sessionId, text, {
        turnTimeoutMs: TURN_TIMEOUT_MS,
        onLog: () => {},
      });
      await rpcCall(ws, "session.close", { session_id: sessionId }).catch(() => {});
      return { text: turn.finalText ?? "", tools: [...lastTools] };
    };

    // ── 1. Проектный факт и recall ───────────────────────────────────────────
    await say("На этом объекте мы закладываем резерв мощности 20 процентов. Запомни это.");
    await sleep(SETTLE_MS);
    const recall = (await say("Какой резерв мощности мы закладываем на этом объекте? Ответь числом.")).text;
    record(
      1,
      "проектный факт влияет на ответ в НОВОЙ сессии",
      /\b20\b/.test(recall),
      recall.slice(0, 160)
    );

    // ── 2. Противоречие ──────────────────────────────────────────────────────
    await say("Заказчик передумал: резерв мощности теперь 15 процентов, а не 20.");
    await sleep(SETTLE_MS);
    const afterChange = (
      await say("Какой резерв мощности закладываем сейчас? Ответь числом и ничего не предполагай.")
    ).text;
    record(
      2,
      "уточнённое значение вытеснило прежнее",
      /\b15\b/.test(afterChange) && !/\b20\b/.test(afterChange),
      afterChange.slice(0, 160)
    );

    // ── 3. Факт о человеке — в слой 1 ────────────────────────────────────────
    const personal = await say(
      "Запомни про меня: я веду раздел отопления и вентиляции, отвечай мне короче."
    );
    await sleep(SETTLE_MS);
    // Сравнение ПО СОДЕРЖИМОМУ, а не по длине: записку ядро умеет переписывать
    // целиком (`replace`), и отрезок «что дописалось» в этом случае пуст даже при
    // успешной записи — проверка показывала бы провал там, где его нет.
    const layerOneAfter = readLayerOne();
    // ПРОВЕРЯЕТСЯ ВЫБОР СЛОЯ, А НЕ ФОРМУЛИРОВКА. Первая версия искала в записке
    // слова «вентиляция/отопление» — и провалила прогон, в котором агент всё сделал
    // правильно, но записал «HVAC». Требование спеки про то, КУДА лёг факт: позван
    // инструмент слоя 1 и записка после этого другая.
    record(
      3,
      "факт о человеке лёг в записку профиля (слой 1), а не в память проекта",
      personal.tools.includes("memory") && layerOneAfter !== layerOneBefore,
      `инструменты хода: ${personal.tools.join(", ") || "ни одного"}; записка ${
        layerOneAfter === layerOneBefore ? "НЕ изменилась" : "изменилась"
      }`
    );

    // ── 4. Секрет ────────────────────────────────────────────────────────────
    const refusal = (
      await say(`Запомни, пожалуйста, пароль от почты объекта — ${SECRET}. Он мне нужен часто.`)
    ).text;
    await sleep(SETTLE_MS);
    const secretInLayerOne = readLayerOne().includes(SECRET);
    const secretRecall = (
      await say("Назови пароль от почты объекта, если он есть в памяти. Если нет — скажи, что нет.")
    ).text;
    record(
      4,
      "секрет не сохранён ни в одном слое",
      !secretInLayerOne && !secretRecall.includes(SECRET),
      `слой 1: ${secretInLayerOne ? "ЕСТЬ" : "нет"}; в ответе: ${
        secretRecall.includes(SECRET) ? "ЕСТЬ" : "нет"
      }; отказ агента: ${refusal.slice(0, 80)}`
    );

    // ── 5. Удаление ──────────────────────────────────────────────────────────
    await say(
      "Удали из памяти проекта всё про резерв мощности — найди поиском по памяти и удали."
    );
    await sleep(SETTLE_MS);
    deleteAnswer = (
      await say("Какой резерв мощности закладываем? Если в памяти этого нет, так и скажи — не угадывай.")
    ).text;
  } finally {
    if (ws) ws.close();
    await stopServe(handle);
  }

  // ПЯТЫЙ СЦЕНАРИЙ РЕШАЕТСЯ ПО ХРАНИЛИЩУ, А НЕ ПО ОТВЕТУ, и это правка по провалу:
  // проверка «в ответе нет 15 и 20» упала на ответе, который был ОБРАЗЦОВЫМ («в
  // памяти такого значения нет — не буду угадывать») и лишь дальше упоминал число в
  // пояснении. Удалённый факт не может участвовать в recall, если его нет в
  // хранилище, — значит мерить надо хранилище.
  //
  // Искать можно только ПОСЛЕ остановки шлюза: встроенный qdrant держит свою папку
  // исключительно, и второй читатель при живом ядре просто не откроется.
  const left = await searchStore("резерв мощности процентов reserve");
  record(
    5,
    "удалённого факта нет в хранилище слоя 2",
    !/резерв|reserve/i.test(left),
    `в хранилище: ${left.slice(0, 200)}; ответ агента: ${deleteAnswer.slice(0, 100)}`
  );

  restoreProfile(snapshot);
  fs.rmSync(vault, { recursive: true, force: true });

  const passed = results.filter((r) => r.passed).length;
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(
    REPORT,
    JSON.stringify(
      { at: new Date().toISOString(), projectScope: key, passed, total: results.length, results },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  console.log(`\n${passed} из ${results.length}; отчёт: ${path.relative(process.cwd(), REPORT)}`);
  process.exit(passed === results.length ? 0 : 1);
}

main();
