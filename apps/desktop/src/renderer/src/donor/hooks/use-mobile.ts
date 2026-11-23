/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/hooks/use-mobile.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useMediaQuery } from './use-media-query'

/** Narrower than this and the sidebar stops being a docked column: it renders
 *  as a floating Sheet over the content instead (components/ui/sidebar.tsx).
 *  Anything that sizes a window around a docked sidebar has to clear it. */
const DOCKED_SIDEBAR_MIN_PX = 768

export const useIsMobile = () => useMediaQuery(`(max-width: ${(DOCKED_SIDEBAR_MIN_PX - 1) / 16}rem)`)
