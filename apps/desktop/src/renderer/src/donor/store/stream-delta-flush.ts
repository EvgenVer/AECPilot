/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/stream-delta-flush.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Lets a mid-turn boundary (an accepted steer) paint the session's buffered stream
 *  deltas before it seals the live bubble, so text the user had already been sent
 *  never lands on the far side of the boundary. The stream hook owns the buffer. */
type DeltaFlush = (sessionId: string) => void

let activeFlush: DeltaFlush | null = null

export function registerStreamDeltaFlush(flush: DeltaFlush): () => void {
  activeFlush = flush

  return () => {
    if (activeFlush === flush) {
      activeFlush = null
    }
  }
}

export function flushStreamDeltas(sessionId: string) {
  activeFlush?.(sessionId)
}
