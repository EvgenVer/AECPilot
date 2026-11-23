/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/stream-delta-flush.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
