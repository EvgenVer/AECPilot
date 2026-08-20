// Замер O6 (задача 3.6): тикает ли планировщик расписаний под `hermes serve`.
//
// Чтение кода отвечает «нет» — единственный старт тикера во всём ядре стоит в
// `gateway/run.py` (`InProcessCronScheduler().start(...)`), то есть в
// МЕССЕНДЖЕР-гейтвее, а `hermes serve` поднимает `tui_gateway/server.py`, другой
// процесс. Но читать мало: от ответа на O6 зависит, есть ли у UR18 хост вообще.
//
// ОПЫТ С КОНТРОЛЕМ. Одного «ничего не произошло» недостаточно: это равно
// объясняется и «тика нет», и «наблюдать нечем». Поэтому две половины:
//   1. задача с расписанием «каждую минуту» живёт под serve дольше двух минут —
//      смотрим, сработала ли сама;
//   2. КОНТРОЛЬ: та же задача дёргается вручную (`POST …/trigger`) — если после
//      этого след появился, значит механизм исполнения жив, и пустота первой
//      половины означает именно отсутствие тика.
//
// НАБЛЮДАЕМАЯ — СЛЕД САМОГО СКРИПТА, а не журнал ядра. Первая редакция пробы
// смотрела в `GET …/runs` и получила ноль в ОБЕИХ половинах: этот маршрут
// возвращает СЕССИИ (`SessionInfo[]`), а задача `no_agent` сессии не создаёт.
// Теперь скрипт дописывает строку в файл, и опыт не зависит от того, как ядро
// ведёт бухгалтерию запусков.
//
// Денег опыт не стоит: задача заведена как `no_agent` со скриптом — ходов
// агента нет, модель не зовётся. Скрипт и его файл создаёт сама проба (профиль
// разработки не в репозитории) и убирает за собой вместе с задачей.
//
// Usage: node runtime/cron-tick-probe.mjs [минуты-ожидания]

import fs from "node:fs";
import path from "node:path";

import { HERMES_HOME_DIR, startServe, waitHealthy, stopServe } from "./serve.mjs";

const JOB_NAME = "aecpilot-tick-probe";
const SCRIPT_NAME = "tick-probe.py";
const WAIT_MINUTES = Number(process.argv[2] ?? 2.5);

const SCRIPTS_DIR = path.join(HERMES_HOME_DIR, "scripts");
const SCRIPT_PATH = path.join(SCRIPTS_DIR, SCRIPT_NAME);
const TRACE_PATH = path.join(SCRIPTS_DIR, "tick-probe-trace.txt");

function writeProbeScript() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.writeFileSync(
    SCRIPT_PATH,
    [
      "# Скрипт замера O6 (задача 3.6), создаётся runtime/cron-tick-probe.mjs.",
      "# Единственное действие — дописать строку со временем в соседний файл:",
      "# это и есть наблюдаемая величина опыта.",
      "import datetime, pathlib",
      "",
      "trace = pathlib.Path(__file__).with_name('tick-probe-trace.txt')",
      "with trace.open('a', encoding='utf-8') as fh:",
      "    fh.write(datetime.datetime.now().isoformat() + '\\n')",
      ""
    ].join("\n"),
    "utf-8"
  );
  fs.writeFileSync(TRACE_PATH, "", "utf-8");
}

function traceLines() {
  try {
    return fs
      .readFileSync(TRACE_PATH, "utf-8")
      .split("\n")
      .filter((l) => l.trim() !== "").length;
  } catch {
    return 0;
  }
}

function cleanupFiles() {
  for (const file of [SCRIPT_PATH, TRACE_PATH]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* уборка не должна ронять вывод замера */
    }
  }
}

function makeRest(handle) {
  const base = `http://${handle.host}:${handle.port}`;
  const headers = {
    "X-Hermes-Session-Token": handle.token,
    "Content-Type": "application/json"
  };
  return async function rest(method, path_, body) {
    const response = await fetch(`${base}${path_}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed };
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  writeProbeScript();
  const handle = await startServe();
  let jobId = null;

  try {
    await waitHealthy(handle);
    const rest = makeRest(handle);
    console.log(`ядро на ${handle.host}:${handle.port}, ожидание ${WAIT_MINUTES} мин`);
    console.log(`след пишется в ${TRACE_PATH}\n`);

    const created = await rest("POST", "/api/cron/jobs", {
      name: JOB_NAME,
      schedule: "* * * * *",
      script: SCRIPT_NAME,
      no_agent: true,
      enabled: true
    });
    jobId = created.body?.id ?? null;
    console.log(`создание: ${created.status}, id ${jobId ?? "НЕ ВЕРНУЛСЯ"}`);
    if (!jobId) {
      console.log(`  тело ответа: ${JSON.stringify(created.body).slice(0, 300)}`);
      throw new Error("задачу не создать — замер невозможен");
    }
    console.log(`  расписание: ${JSON.stringify(created.body?.schedule)}, no_agent: ${JSON.stringify(created.body?.no_agent)}`);

    // ── Половина 1: ждём тик ─────────────────────────────────────────────
    console.log("\nПОЛОВИНА 1 — ждём, сработает ли само");
    const deadline = Date.now() + WAIT_MINUTES * 60_000;
    let tickedByItself = false;
    while (Date.now() < deadline) {
      await sleep(20_000);
      const n = traceLines();
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      console.log(`  строк в следе: ${n}  (осталось ждать ${left} с)`);
      if (n > 0) {
        tickedByItself = true;
        break;
      }
    }

    const afterWait = await rest("GET", `/api/cron/jobs/${jobId}`);
    console.log(`  last_run после ожидания: ${JSON.stringify(afterWait.body?.last_run)}`);

    // ── Половина 2: контроль ─────────────────────────────────────────────
    console.log("\nПОЛОВИНА 2 — КОНТРОЛЬ: дёргаем вручную");
    const triggered = await rest("POST", `/api/cron/jobs/${jobId}/trigger`);
    console.log(`  POST …/trigger: ${triggered.status}`);
    let manual = 0;
    for (let i = 0; i < 10 && manual === 0; i += 1) {
      await sleep(2000);
      manual = traceLines();
    }
    console.log(`  строк в следе после ручного дёрганья: ${manual}`);
    const afterTrigger = await rest("GET", `/api/cron/jobs/${jobId}`);
    console.log(`  last_run после дёрганья: ${JSON.stringify(afterTrigger.body?.last_run)}`);

    // ── Вывод ────────────────────────────────────────────────────────────
    console.log("\nВЫВОД");
    if (tickedByItself) {
      console.log("  планировщик ПОД `hermes serve` ТИКАЕТ — задача сработала сама.");
    } else if (manual > 0) {
      console.log("  планировщик под `hermes serve` НЕ ТИКАЕТ.");
      console.log("  контроль показал, что исполнение живо: ручное дёрганье оставило след,");
      console.log("  а прошедшее время — нет. Значит пустота первой половины это отсутствие");
      console.log("  тика, а не отсутствие наблюдаемой.");
    } else {
      console.log("  НЕОПРЕДЕЛЁННО: следа нет ни от времени, ни от ручного дёрганья —");
      console.log("  по этому опыту про тик сказать нечего, наблюдаемая снова не та.");
      process.exitCode = 1;
    }
  } finally {
    if (jobId) {
      try {
        const rest = makeRest(handle);
        const removed = await rest("DELETE", `/api/cron/jobs/${jobId}`);
        console.log(`\nуборка задачи: DELETE ${removed.status}`);
      } catch (error) {
        console.log(`\nуборка НЕ УДАЛАСЬ: ${error.message} — задача ${jobId} осталась`);
      }
    }
    await stopServe(handle);
    cleanupFiles();
  }
}

await main();
