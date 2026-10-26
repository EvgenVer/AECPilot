// Pure logic for task 1.5.D1's reasoning card: the small grey meta line next
// to "Рассуждение" in design/screens/Chat.html §5.9 ("3 шага · 4 с").
// Framework-free so it unit-tests on its own (same convention as
// explorer-search-pure.ts / panel-sizes-pure.ts).
//
// Deliberately returns `undefined` rather than inventing a value when the
// underlying signal is missing — docs/history/specs/agent-chat.md's "мета не выдумывается"
// (same rule that kept the fabricated file counters out of task 1.5.5).

/** Russian plural for «шаг» — 1 шаг · 2–4 шага · 5–20 шагов, then by the
 * last digit (11–14 are the usual exception). */
export function stepsLabel(count: number): string {
  const abs = Math.abs(count)
  const lastTwo = abs % 100
  const last = abs % 10
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} шагов`
  if (last === 1) return `${count} шаг`
  if (last >= 2 && last <= 4) return `${count} шага`
  return `${count} шагов`
}

/** Formats an elapsed span in ms as «4 с» / «1 м 5 с» / «2 м». Sub-second
 * spans round up to 1 с so a fast turn never reads as «0 с». */
export function durationLabel(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds} с`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes} м` : `${minutes} м ${seconds} с`
}

export interface ReasoningMetaInput {
  segments: number
  startedAt?: number
  endedAt?: number
}

/** Builds the meta line, or `undefined` when there is nothing honest to show.
 *
 * - steps appear once there is more than one (a single step is the ordinary
 *   case and adds no information);
 * - the duration appears only once the block is sealed AND both timestamps
 *   are present (a still-streaming block has no end, and the dispatcher may
 *   supply no timestamps at all — see `ChatReasoning`);
 * - a negative/backwards span is treated as no signal rather than rendered. */
export function reasoningMeta(input: ReasoningMetaInput): string | undefined {
  const parts: string[] = []

  if (input.segments > 1) parts.push(stepsLabel(input.segments))

  const { startedAt, endedAt } = input
  if (startedAt !== undefined && endedAt !== undefined && endedAt >= startedAt) {
    parts.push(durationLabel(endedAt - startedAt))
  }

  return parts.length > 0 ? parts.join(' · ') : undefined
}
