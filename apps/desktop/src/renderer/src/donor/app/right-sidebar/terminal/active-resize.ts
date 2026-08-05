/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/right-sidebar/terminal/active-resize.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
interface ActiveTerminalResizeOptions {
  fitOnActivate?: boolean
  onActivate: () => void
  onFit: () => void
}

/**
 * Observe one visible xterm host.
 *
 * Inactive terminals never call this helper, so their preserved DOM/PTY stays
 * mounted without paying for ResizeObserver delivery or FitAddon work. The
 * first frame owns activation and ignores the observer's initial delivery;
 * later resize bursts are coalesced to one fit per animation frame.
 */
export function observeActiveTerminalResize(
  host: HTMLElement,
  { fitOnActivate = true, onActivate, onFit }: ActiveTerminalResizeOptions
): () => void {
  let activated = false
  let frame = 0
  let initialResizeDelivered = false
  let stopped = false

  const scheduleFit = () => {
    if (!activated || stopped || frame !== 0) {
      return
    }

    frame = window.requestAnimationFrame(() => {
      frame = 0

      if (!stopped) {
        onFit()
      }
    })
  }

  const observer = new ResizeObserver(() => {
    // ResizeObserver's initial delivery is asynchronous in browsers and may
    // arrive before OR after the activation rAF. Activation already fits the
    // current box, so absorb that first delivery in either ordering.
    if (!initialResizeDelivered) {
      initialResizeDelivered = true

      return
    }

    scheduleFit()
  })

  observer.observe(host)

  frame = window.requestAnimationFrame(() => {
    frame = 0

    if (stopped) {
      return
    }

    activated = true

    if (fitOnActivate) {
      onFit()
    }

    onActivate()
  })

  return () => {
    stopped = true
    observer.disconnect()

    if (frame !== 0) {
      window.cancelAnimationFrame(frame)
      frame = 0
    }
  }
}
