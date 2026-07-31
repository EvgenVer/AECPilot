// Pure parsing for the "Поведение агента" section (task 1.6.B2.13).
//
// `config.get` keys its answer shape by `key`, so each reader below is small
// and specific. Two of them carry a distinction that is easy to flatten and
// expensive to lose:
//   - reasoning has TWO independent settings behind one key — how hard the
//     model thinks (`value`) and whether we show the trace (`display`);
//   - `verbose` is `display.tool_progress`, and its `off` value is what makes
//     tool cards disappear from the transcript entirely.

import type { ConfigGetResult } from '../../../shared/gateway/types'

/** Effort levels their `parse_reasoning_effort` accepts. `none` is "thinking
 * off" and is a real choice, distinct from an empty value, which means the
 * provider's own default. */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export interface ReasoningSetting {
  /** '' = provider default (their handler's own fallback is `medium`, but an
   * empty answer must not be redrawn as an explicit medium). */
  effort: string
  /** Whether the reasoning trace is shown in the transcript. */
  shown: boolean
}

export function readReasoning(result: ConfigGetResult | undefined): ReasoningSetting {
  return {
    effort: typeof result?.value === 'string' ? result.value : '',
    shown: result?.display === 'show'
  }
}

export function readFast(result: ConfigGetResult | undefined): boolean {
  return result?.value === 'fast'
}

/** Tool-progress modes, in their own order (`off` → `new` → `all` →
 * `verbose`).
 *
 * `off` is worth spelling out in the UI: it does not merely reduce detail, it
 * suppresses `tool.start`/`tool.complete` on the gateway side, so the chat
 * shows no tool cards at all and a busy agent looks idle. */
export const TOOL_PROGRESS_MODES = ['off', 'new', 'all', 'verbose'] as const
export type ToolProgressMode = (typeof TOOL_PROGRESS_MODES)[number]

export const TOOL_PROGRESS_LABELS: Record<ToolProgressMode, string> = {
  off: 'не показывать (карточек инструментов в чате не будет)',
  new: 'только новые вызовы',
  all: 'все вызовы',
  verbose: 'все вызовы подробно'
}

export function readToolProgress(result: ConfigGetResult | undefined): ToolProgressMode {
  const value = result?.value
  return (TOOL_PROGRESS_MODES as readonly string[]).includes(value ?? '')
    ? (value as ToolProgressMode)
    : 'all'
}

/** How the composer behaves while the agent is busy.
 *
 * An unrecognised value reads as `queue`, never as `interrupt`: guessing wrong
 * toward "queue" costs a delayed message, guessing wrong toward "interrupt"
 * kills a turn the user did not mean to stop. */
export const BUSY_MODES = ['queue', 'steer', 'interrupt'] as const
export type BusyMode = (typeof BUSY_MODES)[number]

export const BUSY_MODE_LABELS: Record<BusyMode, string> = {
  queue: 'встать в очередь и уйти, когда агент освободится',
  steer: 'подрулить — влить текст в идущий ход',
  interrupt: 'прервать текущий ход'
}

export function readBusyMode(result: ConfigGetResult | undefined): BusyMode {
  const value = result?.value
  return (BUSY_MODES as readonly string[]).includes(value ?? '') ? (value as BusyMode) : 'queue'
}

export function readPrompt(result: ConfigGetResult | undefined): string {
  return typeof result?.prompt === 'string' ? result.prompt : ''
}

/** The value that clears a custom system prompt. Their handler treats the
 * literal string `clear` specially — sending an empty string would store an
 * empty prompt instead of removing the key. */
export const CLEAR_PROMPT_VALUE = 'clear'

/** Explains a `config.set` refusal in the section's own terms.
 *
 * Their 4002 for fast mode is the one a user meets in practice: the setting is
 * fine, the MODEL does not support it. Repeating the raw error would read as a
 * bug in the toggle. */
export function describeConfigError(key: string, message: string): string {
  const text = message.trim()
  if (key === 'fast' && /not available for this model/i.test(text)) {
    return 'Быстрый режим недоступен для выбранной модели — переключатель вернулся в прежнее положение.'
  }
  if (key === 'fast' && /without a selected model/i.test(text)) {
    return 'Модель не выбрана — быстрый режим включать не к чему.'
  }
  return text === '' ? 'Ядро отклонило изменение' : `Ядро отклонило изменение: ${text}`
}
