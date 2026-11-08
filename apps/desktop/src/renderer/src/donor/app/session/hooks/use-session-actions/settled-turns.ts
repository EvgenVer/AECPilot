/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-session-actions/settled-turns.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * When this renderer last settled a turn of each runtime session on screen
 * (message.complete), so a resume that was in flight meanwhile can tell its
 * snapshot is older than the reply on screen (resume-reconcile.ts). Bounded: a
 * resume only asks about the seconds its own RPC was in flight.
 *
 * A settle counts only when the view was bound to that runtime as it landed. A
 * cold resume unbinds the view until its RPC answers, so a `message.complete`
 * arriving in that window settles the runtime's state but never reaches the
 * screen. The view still holds the partial reply then, and keeping it would
 * freeze the reply at its first chunk.
 */

const settledAt = new Map<string, number>()
const MAX_TRACKED_SESSIONS = 64

export function noteTurnSettled(runtimeSessionId: string, onView: boolean, at = Date.now()): void {
  settledAt.delete(runtimeSessionId)

  if (!onView) {
    return
  }

  settledAt.set(runtimeSessionId, at)

  if (settledAt.size > MAX_TRACKED_SESSIONS) {
    settledAt.delete(settledAt.keys().next().value as string)
  }
}

/** Whether a turn of this runtime session settled on screen at or after `sinceMs`. */
export function turnSettledSince(runtimeSessionId: string, sinceMs: number): boolean {
  return (settledAt.get(runtimeSessionId) ?? -Infinity) >= sinceMs
}
