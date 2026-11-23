/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/shell/use-touch-titlebar.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { TITLEBAR_HEIGHT, TOUCH_TITLEBAR_HEIGHT } from '@/app/shell/titlebar'
import { useMediaQuery } from '@/hooks/use-media-query'
import { hostHas } from '@/lib/host-capabilities'
import { TOUCH_POINTER_QUERY } from '@/lib/touch-interaction'

/** Browser touch chrome needs a 44px band, not Electron's compact 34px band. */
export function useTouchTitlebar(): boolean {
  const touch = useMediaQuery(TOUCH_POINTER_QUERY)

  return hostHas('touchSizedControls') && touch
}

export function useTitlebarHeight(): number {
  return useTouchTitlebar() ? TOUCH_TITLEBAR_HEIGHT : TITLEBAR_HEIGHT
}
