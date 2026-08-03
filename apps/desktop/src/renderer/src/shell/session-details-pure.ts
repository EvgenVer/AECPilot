// Pure logic behind "Детали сессии" (tasks 1.6.B5.11–B5.15). Contract:
// specs/agent-sessions.md.
//
// The rule that shapes this file: the gateway OMITS what it does not know
// instead of sending a zero (their own comment on `_get_usage`: "leave it
// unknown otherwise"), so every reader here has to distinguish "0" from
// "absent". Rendering a missing `context_used` as 0 % would invent a reading
// the core deliberately refused to make.

import type { ContextBreakdownResult, SessionUsageResult } from '../../../shared/gateway/types'

export interface UsageLine {
  label: string
  value: string
}

/** Thousands separated with a no-break space — a six-digit token count is
 * otherwise unreadable at caption size, and a plain space would let a number
 * wrap mid-way. Written as an escape on purpose: an invisible separator in
 * source is a separator nobody can match in a test. */
export const THOUSANDS_SEPARATOR = '\u00a0'

export function formatTokens(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR)
}

/** The four numbers the task asks for, plus the model that spent them.
 * A field the gateway did not send shows as "—", never as 0. */
export function usageLines(usage: SessionUsageResult | undefined): UsageLine[] {
  if (!usage) return []
  return [
    { label: 'Вход', value: formatTokens(usage.input) },
    { label: 'Выход', value: formatTokens(usage.output) },
    { label: 'Размышления', value: formatTokens(usage.reasoning) },
    { label: 'Вызовов к модели', value: formatTokens(usage.calls) }
  ]
}

/** How full the context window is.
 *
 * `context_used`/`context_max` are absent exactly when the core cannot measure
 * the current window occupancy — their comment says so and points at the bug
 * that made them stop substituting the cumulative total. "неизвестно" is the
 * honest rendering of that; "0 %" would be a fabricated one. */
export function describeContextFill(usage: SessionUsageResult | undefined): string {
  const used = usage?.context_used
  const max = usage?.context_max
  if (typeof used !== 'number' || typeof max !== 'number' || max <= 0) {
    return 'неизвестно — ядро не сообщает заполненность окна для этой сессии'
  }
  const percent = Math.max(0, Math.min(100, Math.round((used / max) * 100)))
  return `${formatTokens(used)} из ${formatTokens(max)} (${percent} %)`
}

/** Their pre-rendered Nous credit lines. Absent unless the user is logged into
 * their portal — an empty block with a heading would read as a failure. */
export function creditLines(usage: SessionUsageResult | undefined): string[] {
  const lines = usage?.credits_lines
  if (!Array.isArray(lines)) return []
  return lines.map((line) => String(line).trim()).filter((line) => line !== '')
}

export interface BreakdownRow {
  id: string
  label: string
  tokens: number
  /** Share of the total, 0–100, rounded. */
  share: number
}

/** Context categories with their share of the total.
 *
 * Their `color` field is dropped here rather than passed through: it holds one
 * of THEIR CSS variables (`var(--ui-text-tertiary)`), which does not exist in
 * this app and would silently resolve to nothing. The palette is ours. */
export function breakdownRows(result: ContextBreakdownResult | undefined): BreakdownRow[] {
  const categories = result?.categories
  if (!Array.isArray(categories) || categories.length === 0) return []
  const total = categories.reduce((sum, item) => sum + (item.tokens || 0), 0)
  return categories.map((item) => ({
    id: item.id,
    label: item.label,
    tokens: item.tokens || 0,
    share: total > 0 ? Math.round(((item.tokens || 0) / total) * 100) : 0
  }))
}

/** An empty `categories` is what their handler answers when the session has no
 * agent built yet — a state, not a failure. */
export const BREAKDOWN_EMPTY_HINT =
  'Агент этой сессии ещё не собран — разбирать пока нечего. Он соберётся при первом сообщении.'

/** The outcome of a manual compression, in before→after terms.
 *
 * `status: 'aborted'` is their own answer for "compression decided not to run"
 * and must not be reported as a success. */
export function describeCompression(outcome: {
  status: string
  beforeMessages: number
  afterMessages: number
  beforeTokens: number
  afterTokens: number
}): string {
  if (outcome.status === 'aborted') {
    return 'Ядро не стало сжимать контекст — сжимать пока нечего.'
  }
  return (
    `Сжато: сообщений ${outcome.beforeMessages} → ${outcome.afterMessages}, ` +
    `токенов ${formatTokens(outcome.beforeTokens)} → ${formatTokens(outcome.afterTokens)}.`
  )
}

/** What `session.undo` actually promises.
 *
 * Their handler pops the turn out of the gateway's IN-MEMORY history and does
 * not touch the database — so the turn is back on the next resume. Saying
 * "отменено" without that qualifier would be a promise the core does not keep
 * (owner decision B5-3). */
export const UNDO_HINT =
  'Отмена снимает последний ход у агента: он перестаёт его учитывать. Запись в истории ' +
  'шлюза при этом остаётся — при переоткрытии сессии ход вернётся.'

export function describeUndo(removed: number): string {
  if (removed === 0) return 'Отменять нечего — последний ход уже снят.'
  return `Ход снят: агент больше не учитывает ${removed} последних записей переписки.`
}
