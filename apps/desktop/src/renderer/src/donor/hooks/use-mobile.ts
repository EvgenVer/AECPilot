/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/hooks/use-mobile.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useMediaQuery } from './use-media-query'

export const useIsMobile = () => useMediaQuery(`(max-width: ${768 / 16 - 1 / 16}rem)`)
