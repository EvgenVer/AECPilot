// Проба расписаний (задача 3.5, UR18) — полный цикл задачи cron против живого
// ядра: создать → прочитать → отредактировать → отключить → включить → история
// запусков → удалить.
//
// Почему проба, а не тест экрана. Экран `donor/app/cron/index.tsx` — 1435 строк
// чужого кода, и по правилу D-31 компонентный тест такого размера стоит ~50
// секунд трансформации в vitest. Но проверять надо не отрисовку: экран ходит в
// ядро ШЕСТЬЮ REST-маршрутами, и вопрос задачи — отвечают ли они и в какой
// форме. Проба берёт ровно те маршруты, которые зовёт `donor/hermes.ts`.
//
// Проба ПИШЕТ в профиль (в этом её смысл — «задача создаётся»), поэтому убирает
// за собой: созданная задача удаляется в `finally` даже при падении посередине.
// Расписание выбрано заведомо далёкое (29 февраля), чтобы задача не выстрелила
// во время прогона.
//
// Usage: node runtime/cron-probe.mjs
// Ключ модели не нужен: ни один маршрут ниже не делает хода агента.

import { startServe, waitHealthy, stopServe } from "./serve.mjs";

const JOB_NAME = "aecpilot-cron-probe";

function makeRest(handle) {
  const base = `http://${handle.host}:${handle.port}`;
  const headers = {
    "X-Hermes-Session-Token": handle.token,
    "Content-Type": "application/json"
  };

  return async function rest(method, path, body) {
    const started = process.hrtime.bigint();
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed, ms };
  };
}

function line(label, result, extra = "") {
  const ok = result.status >= 200 && result.status < 300;
  console.log(
    `  ${ok ? "OK  " : "ПЛОХО"} ${label}: ${result.status} [${result.ms.toFixed(0)} ms]${extra ? ` — ${extra}` : ""}`
  );
  return ok;
}

async function main() {
  const handle = await startServe();
  let jobId = null;
  const failures = [];

  try {
    await waitHealthy(handle);
    const rest = makeRest(handle);
    console.log(`ядро на ${handle.host}:${handle.port}\n`);

    // ── 1. Создание ──────────────────────────────────────────────────────
    console.log("СОЗДАНИЕ");
    const created = await rest("POST", "/api/cron/jobs", {
      name: JOB_NAME,
      prompt: "Проверь, появились ли новые листы в источниках проекта.",
      schedule: "0 9 29 2 *",
      enabled: true
    });
    if (!line("POST /api/cron/jobs", created, JSON.stringify(created.body).slice(0, 120))) {
      failures.push("создание");
    }
    jobId = created.body?.id ?? created.body?.job?.id ?? created.body?.job_id ?? null;
    console.log(`  id задачи: ${jobId ?? "НЕ ВЕРНУЛСЯ"}`);
    if (!jobId) failures.push("id задачи не вернулся");

    // ── 2. Чтение списка и одной задачи ──────────────────────────────────
    console.log("\nЧТЕНИЕ");
    const list = await rest("GET", "/api/cron/jobs");
    const jobs = Array.isArray(list.body) ? list.body : (list.body?.jobs ?? []);
    if (!line("GET /api/cron/jobs", list, `задач в списке: ${jobs.length}`)) failures.push("список");
    if (!jobs.some((j) => j?.name === JOB_NAME)) failures.push("созданной задачи нет в списке");

    if (jobId) {
      const one = await rest("GET", `/api/cron/jobs/${encodeURIComponent(jobId)}`);
      if (!line(`GET /api/cron/jobs/{id}`, one, `поля: ${Object.keys(one.body ?? {}).join(", ").slice(0, 110)}`)) {
        failures.push("чтение одной задачи");
      }
    }

    // ── 3. Редактирование ────────────────────────────────────────────────
    console.log("\nРЕДАКТИРОВАНИЕ");
    if (jobId) {
      // Форма тела не плоская: `updateCronJob` в `donor/hermes.ts` шлёт
      // `{ updates: {...} }`, и плоское тело ядро отбивает 422. Проба сначала
      // послала плоское и получила ровно это — форма взята из их клиента, а не
      // угадана.
      const edited = await rest("PUT", `/api/cron/jobs/${encodeURIComponent(jobId)}`, {
        updates: {
          prompt: "Изменённый текст задания.",
          schedule: "30 9 29 2 *"
        }
      });
      if (!line("PUT /api/cron/jobs/{id}", edited)) failures.push("редактирование");

      const after = await rest("GET", `/api/cron/jobs/${encodeURIComponent(jobId)}`);
      const prompt = after.body?.prompt ?? "";
      const stuck = !String(prompt).includes("Изменённый");
      console.log(`  правка ${stuck ? "НЕ ВИДНА при перечитывании" : "видна при перечитывании"}`);
      if (stuck) failures.push("правка не сохранилась");
    }

    // ── 4. Отключение и включение ────────────────────────────────────────
    console.log("\nОТКЛЮЧЕНИЕ И ВКЛЮЧЕНИЕ");
    if (jobId) {
      const paused = await rest("POST", `/api/cron/jobs/${encodeURIComponent(jobId)}/pause`);
      if (!line("POST …/pause", paused)) failures.push("отключение");

      const afterPause = await rest("GET", `/api/cron/jobs/${encodeURIComponent(jobId)}`);
      const enabled = afterPause.body?.enabled;
      console.log(`  поле enabled после pause: ${JSON.stringify(enabled)}`);
      if (enabled !== false) failures.push("отключение не отразилось в enabled");

      const resumed = await rest("POST", `/api/cron/jobs/${encodeURIComponent(jobId)}/resume`);
      if (!line("POST …/resume", resumed)) failures.push("включение");
    }

    // ── 5. История запусков ──────────────────────────────────────────────
    console.log("\nИСТОРИЯ ЗАПУСКОВ");
    if (jobId) {
      const runs = await rest("GET", `/api/cron/jobs/${encodeURIComponent(jobId)}/runs?limit=20`);
      const rows = Array.isArray(runs.body) ? runs.body : (runs.body?.runs ?? []);
      if (!line("GET …/runs", runs, `записей: ${rows.length} (у новой задачи ноль — это верно)`)) {
        failures.push("история запусков");
      }
    }

    // ── 6. Витрины экрана ────────────────────────────────────────────────
    console.log("\nВИТРИНЫ, КОТОРЫЕ ЗОВЁТ ЭКРАН");
    const blueprints = await rest("GET", "/api/cron/blueprints");
    const bp = Array.isArray(blueprints.body) ? blueprints.body : (blueprints.body?.blueprints ?? []);
    if (!line("GET /api/cron/blueprints", blueprints, `заготовок: ${bp.length}`)) failures.push("заготовки");

    const targets = await rest("GET", "/api/cron/delivery-targets");
    const tg = Array.isArray(targets.body) ? targets.body : (targets.body?.targets ?? []);
    if (!line("GET /api/cron/delivery-targets", targets, `адресатов доставки: ${tg.length}`)) {
      failures.push("адресаты доставки");
    }
  } finally {
    if (jobId) {
      console.log("\nУБОРКА");
      try {
        const rest = makeRest(handle);
        const removed = await rest("DELETE", `/api/cron/jobs/${encodeURIComponent(jobId)}`);
        line("DELETE /api/cron/jobs/{id}", removed);
      } catch (error) {
        console.log(`  уборка НЕ УДАЛАСЬ: ${error.message} — задача ${jobId} осталась в профиле`);
      }
    }
    await stopServe(handle);
  }

  console.log("");
  if (failures.length > 0) {
    console.log(`ИТОГ: ПЛОХО — ${failures.length}: ${failures.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("ИТОГ: полный цикл расписания прошёл — создание, чтение, правка, отключение, включение, история.");
  }
}

await main();
