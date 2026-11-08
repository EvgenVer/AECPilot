/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/display-timestamps.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * `display.timestamps` — one config key for message timestamps everywhere.
 *
 * The same config.yaml key that puts [HH:MM] stamps on classic-CLI labels
 * gates the desktop transcript's per-message / per-tool-run timeline
 * timestamps (#41531, #65272, #68052). Off by default, matching the CLI
 * default in hermes_cli/config_defaults.py.
 *
 * Display-only: reading or toggling it never mutates model context, so it is
 * prompt-cache safe. Hover tooltips with the exact time (#70450) are NOT
 * gated — they add no visual noise until the user asks for them.
 */

import { atom } from 'nanostores'

export const $displayTimestamps = atom<boolean>(false)

// `/timestamps` is a this-window choice: it outranks the config default until the window closes,
// so a routine config refresh does not undo it.
let windowOverride: boolean | null = null

export function setDisplayTimestampsFromConfig(value: unknown): void {
  $displayTimestamps.set(windowOverride ?? (value === true || value === 'true' || value === 1))
}

export function setDisplayTimestampsWindowOverride(value: boolean): void {
  windowOverride = value
  $displayTimestamps.set(value)
}
