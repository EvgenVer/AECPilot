// Рутины специалиста (задача 3C.5, SPEC UR27).
//
// Рутина — это расписание, привязанное к специалисту, который его выполняет:
// «Смета каждую пятницу пересчитывает объёмы». Ядро хранит расписания ПО
// ПРОФИЛЯМ (`<HERMES_HOME>/cron/jobs.json`), и каждая точка его REST принимает
// `profile` — значит «рутина принадлежит специалисту» это не наша надстройка, а
// то, как оно устроено. Наше дело — не потерять эту привязку по дороге.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ ЧЕРЕЗ ИХ ЭКРАН. Их код зовёт REST через мост, а
// наш мост профиль не передаёт (у нас один процесс ядра на все профили, и
// маршрутизация идёт параметром сессии). Отправлять расписание «куда-нибудь» —
// это создать рутину не тому специалисту, и человек узнает об этом, когда она
// сработает не так. Поэтому здесь свой путь, с явным `profile` в каждом вызове.
//
// КТО ИХ ЗАПУСКАЕТ. Тикает планировщик в их процессе-шлюзе, и человек решает,
// поднимать ли его (задача 3.6а). Здесь только список и правка.

import type { RestTarget } from './hermes-rest'

export interface RoutinesDeps {
  rest: <T>(
    path: string,
    options?: { method?: string; body?: unknown; query?: Record<string, string> }
  ) => Promise<T>
  target: () => RestTarget | undefined
}

let deps: RoutinesDeps | undefined

export function configureRoutines(value: RoutinesDeps): void {
  deps = value
}

function core(): RoutinesDeps {
  if (!deps) throw new Error('рутины не подключены к ядру')
  return deps
}

export interface Routine {
  id: string
  name: string
  prompt: string
  schedule: string
  enabled: boolean
  nextRunAt: string
  lastRunAt: string
  lastError: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function parseRoutine(raw: unknown): Routine | null {
  if (typeof raw !== 'object' || raw === null) return null

  const row = raw as Record<string, unknown>
  const id = text(row.id)
  if (id === '') return null

  const schedule = (row.schedule ?? {}) as { display?: unknown; expr?: unknown }

  return {
    id,
    name: text(row.name),
    prompt: text(row.prompt),
    schedule: text(row.schedule_display) || text(schedule.display) || text(schedule.expr),
    enabled: row.enabled === true,
    nextRunAt: text(row.next_run_at),
    lastRunAt: text(row.last_run_at),
    lastError: text(row.last_error)
  }
}

/**
 * Рутины одного специалиста и общее их число.
 *
 * Второе нужно ради одной фразы: «рутины есть, но не у этого специалиста».
 * Пустой список без этой фразы читается как «расписаний нет вообще» — и человек
 * заводит второе такое же (их урок `routines-filter-hint`).
 */
export async function listRoutines(profile: string): Promise<{
  routines: Routine[]
  totalOfAll: number
}> {
  const mine = await core().rest<unknown>('/api/cron/jobs', { query: { profile } })
  const all = await core()
    .rest<unknown>('/api/cron/jobs', { query: { profile: 'all' } })
    .catch(() => [])

  return {
    routines: rows(mine),
    totalOfAll: rows(all).length
  }
}

function rows(answer: unknown): Routine[] {
  const list = Array.isArray(answer) ? answer : ((answer as { jobs?: unknown[] })?.jobs ?? [])
  return (Array.isArray(list) ? list : [])
    .map(parseRoutine)
    .filter((routine): routine is Routine => routine !== null)
}

export interface RoutineOutcome {
  ok: boolean
  error?: string
}

export async function createRoutine(
  profile: string,
  input: { name: string; prompt: string; schedule: string }
): Promise<RoutineOutcome> {
  if (input.prompt.trim() === '' || input.schedule.trim() === '') {
    return { ok: false, error: 'Нужны и задание, и расписание' }
  }

  try {
    await core().rest('/api/cron/jobs', {
      method: 'POST',
      // Профиль — В ЗАПРОСЕ, а не в теле: ядро берёт его именно оттуда, и
      // отправить рутину «текущему» значило бы поручить её не тому.
      query: { profile },
      body: { name: input.name, prompt: input.prompt, schedule: input.schedule }
    })
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }
}

/** Пауза и возврат — две разные точки ядра, поэтому одно действие, а не
 * переключатель: «поставить на паузу» и «снять с паузы» человек делает одной
 * кнопкой, а ядро — двумя вызовами. */
export async function setRoutineEnabled(
  profile: string,
  id: string,
  enabled: boolean
): Promise<RoutineOutcome> {
  try {
    await core().rest(`/api/cron/jobs/${encodeURIComponent(id)}/${enabled ? 'resume' : 'pause'}`, {
      method: 'POST',
      query: { profile }
    })
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }
}

/** «Выполнить сейчас». Существует потому, что расписание проверяется только
 * тем, что оно СРАБОТАЛО: ждать пятницы, чтобы узнать про опечатку в задании, —
 * не проверка. */
export async function runRoutineNow(profile: string, id: string): Promise<RoutineOutcome> {
  try {
    await core().rest(`/api/cron/jobs/${encodeURIComponent(id)}/trigger`, {
      method: 'POST',
      query: { profile }
    })
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: describe(error) }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
