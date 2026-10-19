// Закрыть приложение, пока агент работает, — решение человека, а не случайность
// (задача 3E.11, UR35).
//
// ЧТО ТЕРЯЕТСЯ БЕЗ ЭТОГО. Ход агента идёт минутами и заканчивается записью на
// диск. Выход в середине убивает ядро посреди вызова инструмента: работа
// пропадает, а то, что агент начал писать, остаётся написанным наполовину.
// Окно — единственная сторона, которая знает, что ход идёт; главный процесс —
// единственная, которая может перехватить выход. Отсюда и мост: окно
// публикует сводку, главный процесс решает, спрашивать ли.
//
// РАЗБОР ЗДЕСЬ, ДИАЛОГ — В `index.ts`. Причина обычная: правило можно
// проверить тестом, диалог — нет.
//
// ДАННЫЕ ИЗ ОКНА — ЧУЖИЕ. Сводку присылает рендерер, а туда приезжает
// перенесённый код донора. Поэтому она нормализуется, а не принимается на
// веру: отрицательное число, дробь, посторонние типы в списке заголовков.

import { mainT } from './i18n'

/** Сколько заголовков показать поимённо; остальные — числом. */
const MAX_LISTED = 4

export interface ActiveWork {
  /** Заголовки чатов, в которых идёт ход. Безымянные дают только счёт. */
  titles: string[]
  /** Сколько ходов идёт, включая безымянные — всегда >= titles.length. */
  count: number
}

export const NO_ACTIVE_WORK: ActiveWork = { count: 0, titles: [] }

export function normalizeActiveWork(payload: unknown): ActiveWork {
  if (!payload || typeof payload !== 'object') return NO_ACTIVE_WORK

  const raw = payload as { count?: unknown; titles?: unknown }
  const titles = Array.isArray(raw.titles)
    ? raw.titles
        .filter((title): title is string => typeof title === 'string')
        .map((title) => title.trim())
        .filter((title) => title !== '')
    : []

  const count =
    typeof raw.count === 'number' && Number.isFinite(raw.count)
      ? Math.max(0, Math.floor(raw.count))
      : 0

  // Счёт не может быть меньше числа названных: иначе окно, приславшее
  // `{count: 0, titles: ['Смета']}`, отменило бы вопрос про идущую работу.
  return { count: Math.max(count, titles.length), titles }
}

/** Свести сводки всех окон в одну. Окна могут показывать одну и ту же сессию,
 * поэтому счёт берётся МАКСИМУМОМ, а не суммой: сложение сосчитало бы один ход
 * дважды и сказало бы человеку неправду о размере потери. */
export function mergeActiveWork(reports: Iterable<ActiveWork>): ActiveWork {
  const titles: string[] = []
  let count = 0

  for (const report of reports) {
    count = Math.max(count, report.count)
    for (const title of report.titles) if (!titles.includes(title)) titles.push(title)
  }

  return { count: Math.max(count, titles.length), titles }
}

export interface QuitPrompt {
  message: string
  detail: string
}

/** О чём спросить перед выходом — или `null`, если спрашивать не о чем. */
export function quitPromptFor(work: ActiveWork): QuitPrompt | null {
  if (work.count < 1) return null

  const listed = work.titles.slice(0, MAX_LISTED)
  const remaining = work.count - listed.length
  const lines = listed.map((title) => `• ${title}`)
  // «и ещё N» дописывается только к НЕПУСТОМУ списку: когда ни один чат не
  // назван, число уже стоит в первой строке, и одинокий пункт «• и ещё 2»
  // читался бы как «кроме этих двух есть ещё два».
  if (remaining > 0 && lines.length > 0) lines.push(mainT('quit.andMore', remaining))

  return {
    message: work.count === 1 ? mainT('quit.oneChat') : mainT('quit.manyChats', work.count),
    detail: [lines.join('\n'), mainT('quit.detail')].filter((line) => line !== '').join('\n\n')
  }
}
