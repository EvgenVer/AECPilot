/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/command-palette/highlight-watcher.tsx
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Reports the cmdk highlight to the palette.
 *
 * cmdk calls the root `onValueChange` only in controlled mode (when the
 * `value` prop is set). This palette is uncontrolled, so that prop never
 * fires. This watcher subscribes to the cmdk store with `useCommandState`,
 * which works in both modes, and reports each highlight change.
 */

import { useCommandState } from 'cmdk'
import { useEffect, useRef } from 'react'

interface HighlightWatcherProps {
  /** Receives the cmdk value of each newly highlighted row. */
  onValue: (value: string) => void
}

export function HighlightWatcher({ onValue }: HighlightWatcherProps): null {
  const value = useCommandState(state => state.value)

  // Pin the callback so the effect fires on highlight changes only. The
  // parent passes a fresh closure on every render.
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue

  useEffect(() => {
    onValueRef.current(value)
  }, [value])

  return null
}
