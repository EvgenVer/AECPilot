/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/tour/tour-active.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Reactive twin of `isTourActive` for UI that must wait out a tour. Lives apart from
 *  run-tour.ts, which is dynamic-imported to keep driver.js off the boot path. */
export const $tourActive = atom(false)
