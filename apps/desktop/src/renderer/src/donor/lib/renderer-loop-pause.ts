/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/renderer-loop-pause.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
interface WindowStatePayload {
  isMinimized?: boolean
  isVisible?: boolean
}

export function createRendererLoopPauseController(onChange: () => void, { pauseWhenUnfocused = true } = {}) {
  let windowPaused = false
  let windowFocused = document.hasFocus()

  const onVisibilityChange = () => onChange()

  const onBlur = () => {
    if (windowFocused) {
      windowFocused = false
      onChange()
    }
  }

  const onFocus = () => {
    if (!windowFocused) {
      windowFocused = true
      onChange()
    }
  }

  const offWindowState = window.hermesDesktop?.onWindowStateChanged?.((payload: WindowStatePayload) => {
    const next = payload?.isMinimized === true || payload?.isVisible === false

    if (windowPaused === next) {
      return
    }

    windowPaused = next
    onChange()
  })

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)

  return {
    dispose: () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      offWindowState?.()
    },
    isPaused: () => document.visibilityState === 'hidden' || (pauseWhenUnfocused && !windowFocused) || windowPaused
  }
}
