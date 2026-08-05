/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/hooks/use-refresh-hotkey.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect, useRef } from 'react'

/**
 * Binds the bare `r` key to a refresh action while the calling view is mounted.
 * Ignored when a modifier is held, the event repeats, or focus is in an
 * editable field (so typing "r" in a search/input never triggers it).
 */
export function useRefreshHotkey(onRefresh: () => void, enabled = true) {
  const ref = useRef(onRefresh)
  ref.current = onRefresh

  useEffect(() => {
    if (!enabled) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'r' && event.key !== 'R') {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) {
        return
      }

      const target = event.target as HTMLElement | null

      if (
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }

      event.preventDefault()
      ref.current()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
