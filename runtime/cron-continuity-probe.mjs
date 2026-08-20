// Проверка непрерывности контекста у расписаний (задача 3.5а, UR18).
//
// ЧТО ПРОВЕРЯЕТСЯ. Ядро при `context_from: ['self']` перед каждым запуском
// подклеивает в начало задания вывод ПРОШЛОГО запуска этой же задачи, с
// заголовком `## Your previous run's output` и указанием не повторять уже
// сообщённое (`cron/scheduler.py`). Проверяем это, а не «показалось ли агенту
// умнее»: наблюдаемая — буквальное присутствие вставки в задании второго
// запуска. Судить о качестве ответа модели здесь нечем и незачем.
//
// ОПЫТ С КОНТРОЛЕМ. Две задачи с одинаковым заданием, обе дёргаются дважды:
//   • с `context_from: ['self']` — во втором задании вставка ДОЛЖНА быть;
//   • без него (контроль) — вставки быть НЕ ДОЛЖНО.
// Без контроля «вставка нашлась» ничего не значило бы: мало ли что ещё ядро
// подклеивает в задание.
//
// СТОИТ ДЕНЕГ: четыре хода агента на ключе владельца. Задание выбрано
// однословным, чтобы ход был самым дешёвым из возможных.
//
// Usage: node runtime/cron-continuity-probe.mjs

import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { HERMES_HOME_DIR, startServe, waitHealthy, stopServe } from "./serve.mjs";

const MARKER = "Your previous run's output";
const PROMPT = "Ответь ровно одним словом: готово.";
const RUN_TIMEOUT_MS = 180_000;

function makeApi(handle) {
  const base = `http://${handle.host}:${handle.port}`;
  const headers = {
    "X-Hermes-Session-Token": handle.token,
    "Content-Type": "application/json"
  };
  return {
    async rest(method, path, body) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const text = await response.text();
      try {
        return { status: response.status, body: text ? JSON.parse(text) : null };
      } catch {
        return { status: response.status, body: text };
      }
    }
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runsOf = (result) => (Array.isArray(result.body) ? result.body : (result.body?.runs ?? []));

/** Дёргает задачу и ждёт, пока число её запусков вырастет. */
async function triggerAndWait(api, jobId, expected) {
  await api.rest("POST", `/api/cron/jobs/${jobId}/trigger`);
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runs = runsOf(await api.rest("GET", `/api/cron/jobs/${jobId}/runs?limit=20`));
    if (runs.length >= expected) return runs;
    await sleep(5000);
  }
  return runsOf(await api.rest("GET", `/api/cron/jobs/${jobId}/runs?limit=20`));
}

/** Ищет вставку в заданиях запусков задачи.
 *
 * Читает `state.db` профиля напрямую, а НЕ `GET /api/sessions/{id}`: первая
 * редакция пробы смотрела туда и не нашла вставку ни у опытной задачи, ни у
 * контрольной — этот маршрут отдаёт сведения о сессии, а не её переписку. То же
 * самое, что случилось с наблюдаемой в `cron-tick-probe.mjs`: механизм работал,
 * врал измеритель. Задания живут в таблице `messages`, где `session_id` — это
 * строковый ключ сессии вида `cron_<id>_<время>`. */
function promptsOf(jobId) {
  const db = new DatabaseSync(path.join(HERMES_HOME_DIR, "state.db"), { readOnly: true });
  try {
    return db
      .prepare(
        "SELECT session_id, content FROM messages WHERE session_id LIKE ? AND role='user' ORDER BY id"
      )
      .all(`cron_${jobId}_%`)
      .map((row) => ({
        session: String(row.session_id),
        length: String(row.content ?? "").length,
        carriesMarker: String(row.content ?? "").includes(MARKER)
      }));
  } finally {
    db.close();
  }
}

async function makeJob(api, name, contextFrom) {
  const created = await api.rest("POST", "/api/cron/jobs", {
    name,
    prompt: PROMPT,
    schedule: "0 9 29 2 *",
    enabled: true,
    ...(contextFrom ? { context_from: contextFrom } : {})
  });
  return created.body?.id ?? null;
}

async function main() {
  const handle = await startServe();
  const created = [];

  try {
    await waitHealthy(handle);
    const api = makeApi(handle);
    console.log(`ядро на ${handle.host}:${handle.port}\n`);

    const withId = await makeJob(api, "aecpilot-continuity-on", ["self"]);
    const withoutId = await makeJob(api, "aecpilot-continuity-off", null);
    for (const id of [withId, withoutId]) if (id) created.push(id);
    console.log(`задачи: с непрерывностью ${withId}, контрольная ${withoutId}`);
    if (!withId || !withoutId) throw new Error("задачи не создались — проверка невозможна");

    const stored = await api.rest("GET", `/api/cron/jobs/${withId}`);
    console.log(`  context_from у первой: ${JSON.stringify(stored.body?.context_from)}\n`);

    console.log("ЗАДАЧА С НЕПРЕРЫВНОСТЬЮ — два запуска");
    await triggerAndWait(api, withId, 1);
    const runsOn = await triggerAndWait(api, withId, 2);
    console.log(`  запусков записано: ${runsOn.length}`);
    const promptsOn = promptsOf(withId);
    for (const p of promptsOn) {
      console.log(`  ${p.session}: ${p.length} знаков, вставка ${p.carriesMarker ? "ЕСТЬ" : "нет"}`);
    }
    const markerOn = promptsOn.some((p) => p.carriesMarker);

    console.log("\nКОНТРОЛЬНАЯ ЗАДАЧА — два запуска");
    await triggerAndWait(api, withoutId, 1);
    const runsOff = await triggerAndWait(api, withoutId, 2);
    console.log(`  запусков записано: ${runsOff.length}`);
    const promptsOff = promptsOf(withoutId);
    for (const p of promptsOff) {
      console.log(`  ${p.session}: ${p.length} знаков, вставка ${p.carriesMarker ? "ЕСТЬ" : "нет"}`);
    }
    const markerOff = promptsOff.some((p) => p.carriesMarker);

    console.log("\nВЫВОД");
    if (markerOn && !markerOff) {
      console.log("  непрерывность работает и включается именно полем: с `self` второй запуск");
      console.log("  видит вывод первого, без него — стартует вслепую.");
    } else if (!markerOn && !markerOff) {
      console.log("  НЕОПРЕДЕЛЁННО: вставки нет ни там, ни там. Либо запуски не дошли до");
      console.log("  агента, либо наблюдаемая снова не та — смотреть `state.db` руками.");
      process.exitCode = 1;
    } else {
      console.log("  ПЛОХО: вставка ведёт себя не так, как обещает поле.");
      process.exitCode = 1;
    }
  } finally {
    for (const id of created) {
      try {
        await makeApi(handle).rest("DELETE", `/api/cron/jobs/${id}`);
      } catch {
        console.log(`  уборка не удалась для ${id}`);
      }
    }
    console.log("\nуборка задач выполнена");
    await stopServe(handle);
  }
}

await main();
