// Замер для задачи 3.6а: ЧТО двигает `next_run_at` у задачи расписания.
//
// ЗАЧЕМ. Свой тик (3.6а) устроен просто: сравнить `next_run_at` с часами и
// дёрнуть `POST …/trigger`. Но такой тик работает ровно один раз, если поле
// после выстрела не сдвигается: во второй заход задача снова «просрочена», а
// пометка «за этот слот стреляли» держит палец. Значит до кода нужно знать,
// КТО и КОГДА пересчитывает это поле:
//   A — сразу после создания (какое время ставит ядро);
//   B — после ручного дёрганья (замер 3.6 говорит «не сдвигает» — проверяем);
//   C — после PUT без изменений (пересчитывает ли ядро на записи);
//   D — просто со временем, когда слот прошёл (пересчитывает ли на чтении).
//
// От ответа зависит архитектура: если поле двигает только ядро на записи, тик
// обходится их же машинерией; если не двигает никто — нам нужен свой разбор
// выражения cron, а это дополнительная зависимость и отдельное решение.
//
// Задача заводится как `no_agent` со скриптом — ходов агента нет, модель не
// зовётся, денег замер не стоит. Скрипт и задача убираются за собой.
//
// Usage: node runtime/cron-next-run-probe.mjs

import fs from "node:fs";
import path from "node:path";

import { HERMES_HOME_DIR, startServe, waitHealthy, stopServe } from "./serve.mjs";

const JOB_NAME = "aecpilot-next-run-probe";
const SCRIPT_NAME = "next-run-probe.py";

const SCRIPTS_DIR = path.join(HERMES_HOME_DIR, "scripts");
const SCRIPT_PATH = path.join(SCRIPTS_DIR, SCRIPT_NAME);

function writeProbeScript() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.writeFileSync(SCRIPT_PATH, "# Замер 3.6а. Ничего не делает намеренно.\npass\n", "utf-8");
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
    console.log(`ядро на ${handle.host}:${handle.port}\n`);

    const created = await rest("POST", "/api/cron/jobs", {
      name: JOB_NAME,
      schedule: "* * * * *",
      script: SCRIPT_NAME,
      no_agent: true,
      enabled: true
    });
    jobId = created.body?.id ?? null;
    if (!jobId) {
      console.log(`создание: ${created.status}, тело ${JSON.stringify(created.body).slice(0, 300)}`);
      throw new Error("задачу не создать — замер невозможен");
    }

    const read = async (label) => {
      const one = await rest("GET", `/api/cron/jobs/${jobId}`);
      const job = one.body ?? {};
      console.log(
        `${label}: next_run_at=${JSON.stringify(job.next_run_at)} last_run_at=${JSON.stringify(job.last_run_at)} state=${JSON.stringify(job.state)}`
      );
      return job.next_run_at ?? null;
    };

    console.log(`сейчас: ${new Date().toISOString()}`);
    const a = await read("A (после создания)   ");

    const triggered = await rest("POST", `/api/cron/jobs/${jobId}/trigger`);
    console.log(`\nPOST …/trigger → ${triggered.status}`);
    await sleep(4000);
    const b = await read("B (после дёрганья)   ");

    // Форма тела — их клиентская: ядро ждёт `{ updates: {...} }` и отбивает
    // плоское 422 (замерено в cron-probe.mjs).
    const put = await rest("PUT", `/api/cron/jobs/${jobId}`, {
      updates: { schedule: "* * * * *" }
    });
    console.log(`\nPUT (то же расписание) → ${put.status}`);
    const c = await read("C (после PUT)        ");

    const paused = await rest("POST", `/api/cron/jobs/${jobId}/pause`);
    const resumed = await rest("POST", `/api/cron/jobs/${jobId}/resume`);
    console.log(`\npause → ${paused.status}, resume → ${resumed.status}`);
    const e = await read("E (после pause+resume)");

    // Последняя надежда обойтись без своего разбора cron: пересчитывает ли ядро
    // поле, когда МЕНЯЕТСЯ само расписание. Если да — тик мог бы «подтолкнуть»
    // ядро сменой выражения туда и обратно. Если нет — пересчитывать некому,
    // кроме нас.
    const changed = await rest("PUT", `/api/cron/jobs/${jobId}`, {
      updates: { schedule: "0 3 * * *" }
    });
    console.log(`\nPUT (ДРУГОЕ расписание) → ${changed.status}`);
    const f = await read("F (другое расписание) ");

    // Ждём, пока слот A заведомо пройдёт, и читаем ещё раз: вдруг ядро
    // пересчитывает поле лениво, на чтении.
    const waitMs = 25_000;
    console.log(`\nждём ${Math.round(waitMs / 1000)} с, чтобы слот заведомо прошёл…`);
    await sleep(waitMs);
    const d = await read("D (слот прошёл)      ");

    console.log("\nВЫВОД");
    console.log(`  дёрганье двигает next_run_at: ${a !== b ? "ДА" : "нет"}`);
    console.log(`  PUT двигает next_run_at:      ${b !== c ? "ДА" : "нет"}`);
    console.log(`  pause+resume двигает:        ${c !== e ? "ДА" : "нет"}`);
    console.log(`  смена расписания двигает:    ${e !== f ? "ДА" : "нет"}`);
    console.log(`  само со временем:             ${e !== d ? "ДА" : "нет"}`);
  } finally {
    if (jobId) {
      try {
        const removed = await makeRest(handle)("DELETE", `/api/cron/jobs/${jobId}`);
        console.log(`\nуборка: DELETE задачи → ${removed.status}`);
      } catch (error) {
        console.log(`\nуборка: задачу ${jobId} удалить не удалось — ${error.message}`);
      }
    }
    try {
      fs.rmSync(SCRIPT_PATH, { force: true });
    } catch {
      /* уборка не должна ронять вывод замера */
    }
    await stopServe(handle);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
