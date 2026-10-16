/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/local-models-flag.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
