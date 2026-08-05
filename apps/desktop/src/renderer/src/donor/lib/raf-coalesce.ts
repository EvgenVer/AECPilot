/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/raf-coalesce.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Coalesce a stream of values (pointermove positions, resize deltas) to one
 *  `apply` per animation frame, so a drag can't drive several layouts per frame.
 *  `push` records the latest value and schedules a frame; `finish` commits the
 *  last value and cancels any pending frame (call it on pointerup/cancel).
 *  `null` is the empty sentinel, so `T` must never legitimately be `null`. */
export function rafCoalesce<T>(apply: (value: T) => void): { finish: () => void; push: (value: T) => void } {
  let frame: null | number = null
  let pending: null | T = null

  const flush = () => {
    frame = null

    if (pending !== null) {
      apply(pending)
    }
  }

  return {
    finish() {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }

      if (pending !== null) {
        apply(pending)
      }
    },
    push(value) {
      pending = value
      frame ??= requestAnimationFrame(flush)
    }
  }
}
