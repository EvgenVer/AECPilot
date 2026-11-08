/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/embeds/use-is-dark.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect, useState } from 'react'

import { useThemeEpoch } from '@/hooks/use-theme-epoch'

const isDarkNow = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

// Tracks the app's dark/light mode off the `dark` class on <html> (set by
// themes/context.tsx). Embeds that theme their own content (tweets) read this.
// Rides the shared theme-repaint observer; setState bails on an unchanged
// boolean, so style-only repaints don't re-render.
export function useIsDark(): boolean {
  const epoch = useThemeEpoch()
  const [dark, setDark] = useState(isDarkNow)

  useEffect(() => setDark(isDarkNow()), [epoch])

  return dark
}
