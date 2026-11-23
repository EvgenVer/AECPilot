/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/long-poll.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The sign-in and handoff reads are long-polls: the backend holds each request until something
// changes. An older backend answers at once, so a loop never asks again sooner than this after its
// previous ask started.
export const LONG_POLL_MIN_GAP_MS = 2000

export function pause(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

/** Wait out the rest of the minimum gap after an ask that started at `askedAt` (`Date.now()`). */
export function restOfLongPollGap(askedAt: number): Promise<void> {
  return pause(Math.max(0, LONG_POLL_MIN_GAP_MS - (Date.now() - askedAt)))
}
