/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/tool-activity.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

// Mirrors `display.tool_progress`, independent of `display.show_reasoning`:
// hiding thinking must not hide the work. Answer-only is both keys off.
// Parsing matches the gateway's `_load_tool_progress_mode` so the renderer and
// the event stream agree: only false / "off" silence tool rows; every other
// mode (all, new, verbose, unknown, missing) keeps them on.
export const $showToolActivity = atom(true)

export function toolProgressVisible(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  return !(typeof value === 'string' && value.trim().toLowerCase() === 'off')
}

export function setShowToolActivityFromConfig(value: unknown): void {
  $showToolActivity.set(toolProgressVisible(value))
}
