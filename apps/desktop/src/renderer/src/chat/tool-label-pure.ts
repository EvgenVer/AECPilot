// Pure logic for task 1.5.D1's tool card label — the guarantee that closes
// the old task 1.5.2 ("тонкие пустые прямоугольники без подписей"):
// a tool card is NEVER rendered without a readable name.
//
// Why a guard rather than a fix upstream: the 1.5.2 forensics established
// that hermes 0.18.0 always sends a name (falling back to "tool" itself), yet
// the owner's screenshot showed unlabeled cards, and no code path could be
// made to reproduce it. Rather than guess at the upstream shape, the render
// layer refuses to produce a label-less card for ANY input — undefined, null
// via a loose payload, empty, or whitespace.

/** Shown when the server sent no usable tool name at all. Deliberately
 * generic: inventing a specific tool name would be worse than admitting we
 * don't have one (docs/history/specs/agent-chat.md — «мета не выдумывается»). */
export const FALLBACK_TOOL_LABEL = 'инструмент'

/** The label to print on a tool card. Always a non-empty, printable string. */
export function toolDisplayName(name: string | undefined): string {
  if (typeof name !== 'string') return FALLBACK_TOOL_LABEL
  const trimmed = name.trim()
  return trimmed === '' ? FALLBACK_TOOL_LABEL : trimmed
}

/** Whether the card has anything worth expanding — drives the chevron, so a
 * card with no args and no result is not a lying "expandable" affordance. */
export function hasToolDetails(call: { args?: unknown; result?: string }): boolean {
  return call.args !== undefined || call.result !== undefined
}
