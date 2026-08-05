/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/pane-shell/edit-mode.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Layout edit mode — the shared toggle for the tree renderer's FancyZones-style
 * rearrangement (see tree/renderer.tsx). The toggle hotkey is a `keybinds`
 * contribution (`layout.editMode`, default ⌘⇧\ — the sibling of ⌘\ = flip
 * panes), so it's rebindable and collision-checked like every other action.
 * This hook only owns Escape-to-exit.
 */

import { atom } from 'nanostores'
import { useEffect } from 'react'

import { ESCAPE_PRIORITY, isTopEscapeLayer, pushEscapeLayer } from '@/lib/escape-layers'

export const $layoutEditMode = atom(false)

export function toggleLayoutEditMode() {
  $layoutEditMode.set(!$layoutEditMode.get())
}

/** Escape exits edit mode. Registered once by the layout root. */
export function useLayoutEditHotkey(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return
    }

    // Own an Escape layer only WHILE edit mode is on, so it doesn't outrank the
    // narrow-pane reveal the rest of the time.
    let releaseLayer: (() => void) | null = null

    const unsub = $layoutEditMode.subscribe(on => {
      if (on && !releaseLayer) {
        releaseLayer = pushEscapeLayer(ESCAPE_PRIORITY.layoutEdit)
      } else if (!on && releaseLayer) {
        releaseLayer()
        releaseLayer = null
      }
    })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !isTopEscapeLayer(ESCAPE_PRIORITY.layoutEdit)) {
        return
      }

      if ($layoutEditMode.get()) {
        e.preventDefault()
        $layoutEditMode.set(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      unsub()
      releaseLayer?.()
    }
  }, [enabled])
}
