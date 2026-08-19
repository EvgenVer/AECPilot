// Tasks 4D-1 and 4D-2: two things the core says to the person, which nothing
// in this app was listening to.
//
// Why this lives in our code and not in the donor's stream handler
// (`donor/app/session/hooks/use-message-stream/gateway-event.ts`): that file
// handles `status.update` for `compacting`/`compacted`/`process`/`goal` and
// stops there — `lifecycle` and `warn` fall off the end, and `tool.output_risk`
// is not mentioned at all. Adding branches to it would be a fifth kind of edit
// to a vendored file (AGENTS §14), and the next re-copy would drop them. Our
// own subscriber, pushing into their notification store, is the sanctioned
// shape: our surface, their component.
//
// (The shell's own `notifications-pure.ts` was the other candidate. It turned
// out to be dead code — nothing had dispatched into it since the renderer moved
// to the donor's shell in phase 1.8 — and it was deleted by the owner's decision
// rather than extended, because dead code with green tests reads as living.)

import { isGatewayEventOfType, type GatewayEvent } from '../../../../shared/gateway/types'

/** What the shell should do about one event. `null` means "not ours". */
export type CoreNoticeAction =
  /** The core wrote the sentence and means it for the person — show it as-is. */
  | { kind: 'toast'; text: string }
  /** A tool's output looks like it is trying to instruct the agent. We write
   * the sentence, because the event deliberately carries no text — only the
   * tool's name and opaque finding ids. */
  | { kind: 'risk'; tool: string; findings: number }
  /** A side path degraded ("compression failed", "memory was not written").
   * Real, but not the person's problem and not their decision: it goes to the
   * log, where it can be found after the fact, and not into a feed they would
   * learn to ignore. */
  | { kind: 'log'; text: string }
  | null

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function coreNoticeAction(event: GatewayEvent): CoreNoticeAction {
  if (isGatewayEventOfType(event, 'status.update')) {
    const body = text(event.payload?.text)
    if (!body) return null
    // Only these two. `compacting`/`compacted` drive their compaction
    // indicator, `process` re-syncs their background-process stack and `goal`
    // updates their goal badge — all four already handled by the donor, and
    // showing them again would double every one of them.
    if (event.payload?.kind === 'lifecycle') return { kind: 'toast', text: body }
    if (event.payload?.kind === 'warn') return { kind: 'log', text: body }
    return null
  }

  if (isGatewayEventOfType(event, 'tool.output_risk')) {
    const payload = event.payload
    // The gateway only emits this when the scan found something, so `risk` is
    // never `low` on the wire. Checked anyway: a notice that fires on a clean
    // result would teach the person to dismiss it without reading, which is
    // worse than not having it.
    if (!payload || payload.risk === 'low') return null
    const findings = Array.isArray(payload.findings) ? payload.findings.length : 0
    if (findings === 0) return null
    const tool = text(payload.name)
    if (!tool) return null
    return { kind: 'risk', tool, findings }
  }

  return null
}
