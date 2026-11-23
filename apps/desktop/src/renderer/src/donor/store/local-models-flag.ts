/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/local-models-flag.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/**
 * Feature-flag gate for every local-models surface in the GUI.
 *
 * On by default on macOS, Windows, and Linux x64/arm64 (`electron/feature-flags.ts`).
 * Elsewhere the app must be launched with `--local` (`hermes desktop --local` or
 * the flag on the executable); without it the Desktop App shows no local-models
 * surface at all, even where local models are configured and running.
 */
export const $localModelsEnabled = atom<boolean>(
  typeof window !== 'undefined' && window.hermesDesktop?.localModelsEnabled === true
)
