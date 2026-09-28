// Запуск задач по расписанию — решения без процессов (задача 3.6а).
//
// ЧТО ЗДЕСЬ ВООБЩЕ РЕШАЕТСЯ. Ядро само расписания не тикает: тикалка живёт в их
// мессенджер-шлюзе — ОТДЕЛЬНОМ процессе, который наше приложение не поднимает
// (замер 3.6). Отсюда прежний план «свой тонкий тик» и предупреждение «само не
// сработает».
//
// ЗАМЕР 2026-08-21 (`runtime/cron-gateway-tick-probe.mjs`) этот план отменил.
// Их шлюз, поднятый БЕЗ единой настроенной платформы, никуда не ходит — он сам
// пишет в лог «No messaging platforms enabled», — а расписания при этом тикает:
// задача «каждую минуту» сработала сама, и `next_run_at` сдвинулся на следующий
// слот. То есть весь их планировщик (догон пропущенных, перевзвод зависших,
// правильный пересчёт времени) достаётся даром, без своего разбора cron и без
// зависимости.
//
// ПОЧЕМУ ПО КНОПКЕ, А НЕ ВСЕГДА (решение владельца 2026-08-21). Цена всё-таки
// есть: это второй долгоживущий процесс, и в замере видно, что он поднимает
// свою копию агентской машинерии — пытался подключить наш MCP-сервер. Кто
// расписаниями не пользуется, за второй процесс платить не должен.

import { join } from 'node:path'

/** Разбор сохранённого выбора. Испорченный файл — это «выключено», а не
 * падение и не «включено»: молча поднять фоновый процесс из-за битого JSON
 * было бы худшим из вариантов. */
export function parseCronRunnerPref(raw: string): boolean {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return false
    return (parsed as { enabled?: unknown }).enabled === true
  } catch {
    return false
  }
}

export function serializeCronRunnerPref(enabled: boolean): string {
  return `${JSON.stringify({ enabled }, null, 2)}\n`
}

/**
 * Окружение их `gateway run` (задача 3F.D1, находка D-136).
 *
 * Память — по тем же правилам, что в `hermes serve` (runtime/memory-config.mjs,
 * задача 5.1а и D-85): телеметрия mem0 выключена, её файлы — в профиле, а не в
 * `~/.mem0`. Обе переменные читаются при импорте.
 *
 * `GATEWAY_MULTIPLEX_PROFILES=true` — рутины СПЕЦИАЛИСТОВ живут в хранилищах их
 * профилей (`<HERMES_HOME>/profiles/<бот>/cron`), и шлюз без мультиплекса тикает
 * только своё, основного профиля: рутина бота по расписанию не срабатывала
 * никогда. В режиме мультиплекса один процесс тикает каждый профиль
 * (`cron/scheduler.py`: «One process multiplexes every profile»). Переменная —
 * их операторское переопределение (`gateway/config.py`), в конфиг человека мы не
 * пишем.
 */
export function cronRunnerSpawnEnv(
  base: NodeJS.ProcessEnv,
  homeDir: string
): NodeJS.ProcessEnv {
  return {
    ...base,
    HERMES_HOME: homeDir,
    MEM0_TELEMETRY: 'false',
    MEM0_DIR: join(homeDir, 'mem0'),
    GATEWAY_MULTIPLEX_PROFILES: 'true'
  }
}
