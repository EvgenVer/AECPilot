/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/tour/tour-active.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Reactive twin of `isTourActive` for UI that must wait out a tour. Lives apart from
 *  run-tour.ts, which is dynamic-imported to keep driver.js off the boot path. */
export const $tourActive = atom(false)
