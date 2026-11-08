/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/pointer-drag.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Run a pointer drag until pointerup, then unbind both listeners.
 *
 *  Capture-phase, on `window`, so the drag keeps tracking when the pointer
 *  leaves the element it started on. Forgetting one half of the teardown leaks
 *  a live pointermove handler for the rest of the session, which is why the
 *  unbinding lives here rather than at each call site. */
export function startPointerDrag(
  onMove: (event: PointerEvent) => void,
  onEnd?: (event: PointerEvent) => void
): () => void {
  const move = (event: PointerEvent) => onMove(event)

  const up = (event: PointerEvent) => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    onEnd?.(event)
  }

  window.addEventListener('pointermove', move, true)
  window.addEventListener('pointerup', up, true)

  return () => {
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
  }
}
