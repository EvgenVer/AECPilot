/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/zoom.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Window text size (zoom).
 *
 * The main process owns the zoom level and persists it (see electron/zoom.ts
 * for the scale). The renderer only mirrors the current percent for the
 * settings UI: preset clicks go to the main process over IPC, and every
 * change comes back through onChanged, including ones made with the
 * Ctrl/Cmd +/-/0 shortcuts or the View menu, so the UI never drifts.
 */

import { atom } from 'nanostores'

export const $zoomPercent = atom<number>(100)

export function setZoomPercent(percent: number): void {
  window.hermesDesktop?.zoom?.setPercent(percent)
}

if (typeof window !== 'undefined' && window.hermesDesktop?.zoom) {
  const zoom = window.hermesDesktop.zoom
  let receivedZoomChange = false

  zoom.onChanged(({ percent }) => {
    receivedZoomChange = true
    $zoomPercent.set(percent)
  })

  void zoom.get().then(({ percent }) => {
    if (!receivedZoomChange) {
      $zoomPercent.set(percent)
    }
  })
}
