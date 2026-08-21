// Замер для задачи 3.6а: тикает ли их планировщик, если поднять мессенджер-шлюз
// БЕЗ единой настроенной платформы.
//
// ЗАЧЕМ. Решение O6 (задача 3.6) отвергло вариант «поднять их шлюз рядом» с
// формулировкой «заводить хост внешних каналов ради таймера — плата не тем». В
// этой формулировке есть непроверенное место: если платформ не настроено, шлюз
// внешних каналов НИКУДА НЕ ХОДИТ — он просто процесс, внутри которого крутится
// их планировщик. Тогда цена варианта совсем другая, и развилка 3.6а (свой
// разбор cron против зависимости) может отпасть целиком.
//
// ОПЫТ. Поднимаем `hermes gateway run` рядом с `hermes serve`, заводим задачу с
// расписанием «каждую минуту» и смотрим, появится ли след сам. Контроль тот же,
// что в `cron-tick-probe.mjs`: если след не появился, дёргаем задачу вручную —
// след после ручного запуска означает, что исполнение живо и пустота первой
// половины говорит именно об отсутствии тика.
//
// Наблюдаемая — файл, который дописывает скрипт задачи, а не журнал ядра: их
// `runs` возвращает СЕССИИ, а задача `no_agent` сессии не создаёт (ловушка,
// снятая замером 3.6).
//
// Usage: node runtime/cron-gateway-tick-probe.mjs [минуты-ожидания]

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { HERMES_BIN, HERMES_HOME_DIR } from "./hermes-env.mjs";
import { startServe, waitHealthy, stopServe } from "./serve.mjs";

const JOB_NAME = "aecpilot-gateway-tick-probe";
const SCRIPT_NAME = "gateway-tick-probe.py";
const WAIT_MINUTES = Number(process.argv[2] ?? 2.5);

const SCRIPTS_DIR = path.join(HERMES_HOME_DIR, "scripts");
const SCRIPT_PATH = path.join(SCRIPTS_DIR, SCRIPT_NAME);
const TRACE_PATH = path.join(SCRIPTS_DIR, "gateway-tick-trace.txt");

function writeProbeScript() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.writeFileSync(
    SCRIPT_PATH,
    [
      "# Скрипт замера 3.6а, создаётся runtime/cron-gateway-tick-probe.mjs.",
      "import datetime, pathlib",
      "",
      "trace = pathlib.Path(__file__).with_name('gateway-tick-trace.txt')",
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
    return fs.readFileSync(TRACE_PATH, "utf-8").split("\n").filter((l) => l.trim() !== "").length;
  } catch {
    return 0;
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
  let gateway = null;
  let gatewayOutput = "";

  try {
    await waitHealthy(handle);
    const rest = makeRest(handle);

    const created = await rest("POST", "/api/cron/jobs", {
      name: JOB_NAME,
      schedule: "* * * * *",
      script: SCRIPT_NAME,
      no_agent: true,
      enabled: true
    });
    jobId = created.body?.id ?? null;
    if (!jobId) throw new Error(`задачу не создать: ${JSON.stringify(created.body).slice(0, 300)}`);
    console.log(`задача заведена: ${jobId}\n`);

    console.log("поднимаем мессенджер-шлюз БЕЗ настроенных платформ…");
    gateway = spawn(HERMES_BIN, ["gateway", "run"], {
      env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR },
      stdio: ["ignore", "pipe", "pipe"]
    });
    gateway.stdout.on("data", (chunk) => (gatewayOutput += chunk.toString()));
    gateway.stderr.on("data", (chunk) => (gatewayOutput += chunk.toString()));
    gateway.on("exit", (code) => console.log(`  шлюз завершился с кодом ${code}`));

    await sleep(8000);
    console.log(`  жив ли шлюз: ${gateway.exitCode === null ? "ДА" : `НЕТ (код ${gateway.exitCode})`}`);
    console.log(`  первые строки вывода:\n${gatewayOutput.split("\n").slice(0, 12).map((l) => "    " + l).join("\n")}`);

    console.log("\nПОЛОВИНА 1 — ждём, сработает ли задача сама");
    const deadline = Date.now() + WAIT_MINUTES * 60_000;
    let ticked = false;
    while (Date.now() < deadline) {
      await sleep(15_000);
      const n = traceLines();
      console.log(`  строк в следе: ${n} (осталось ${Math.max(0, Math.round((deadline - Date.now()) / 1000))} с)`);
      if (n > 0) {
        ticked = true;
        break;
      }
    }

    let manual = 0;
    if (!ticked) {
      console.log("\nПОЛОВИНА 2 — КОНТРОЛЬ: дёргаем вручную");
      await rest("POST", `/api/cron/jobs/${jobId}/trigger`);
      for (let i = 0; i < 10 && manual === 0; i += 1) {
        await sleep(2000);
        manual = traceLines();
      }
      console.log(`  строк после ручного дёрганья: ${manual}`);
    }

    const after = await rest("GET", `/api/cron/jobs/${jobId}`);
    console.log(`\n  next_run_at после всего: ${JSON.stringify(after.body?.next_run_at)}`);

    console.log("\nВЫВОД");
    if (ticked) {
      console.log("  ШЛЮЗ БЕЗ ПЛАТФОРМ ТИКАЕТ — вариант «как у них» стоит дёшево.");
    } else if (manual > 0) {
      console.log("  шлюз без платформ НЕ тикает, хотя исполнение живо (контроль сработал).");
    } else {
      console.log("  не сработало ничего — замер неинформативен, наблюдаемая под вопросом.");
    }
    console.log(`\nвывод шлюза целиком (${gatewayOutput.length} симв.):\n${gatewayOutput.slice(0, 3000)}`);
  } finally {
    if (gateway && gateway.exitCode === null) gateway.kill();
    if (jobId) {
      try {
        await makeRest(handle)("DELETE", `/api/cron/jobs/${jobId}`);
      } catch {
        /* уборка не должна ронять вывод замера */
      }
    }
    for (const file of [SCRIPT_PATH, TRACE_PATH]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        /* то же */
      }
    }
    await stopServe(handle);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
