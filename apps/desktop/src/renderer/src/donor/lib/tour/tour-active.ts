/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/tour/tour-active.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Reactive twin of `isTourActive` for UI that must wait out a tour. Lives apart from
 *  run-tour.ts, which is dynamic-imported to keep driver.js off the boot path. */
export const $tourActive = atom(false)
