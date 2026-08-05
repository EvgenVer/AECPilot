/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/input-modality.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Which input device drove the most recent interaction.
 *
 *  Chromium's `:focus-visible` is not enough to tell a mouse pick from a Tab.
 *  Radix menus autofocus their content on open and keyboard-navigate their
 *  items, so by the time a mouse click closes the menu and restores focus to
 *  the trigger, Chromium has decided the page is in keyboard modality and
 *  matches `:focus-visible` on that restore (verified in Chrome — the model
 *  pill's tooltip popped open after every mouse pick). Track the device
 *  ourselves and use it to qualify `:focus-visible`.
 */

export type InputModality = 'keyboard' | 'pointer'

let modality: InputModality = 'keyboard'

/** Capture-phase so a `stopPropagation` deeper in the tree can't blind us. */
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (modality = 'pointer'), { capture: true, passive: true })
  document.addEventListener('keydown', () => (modality = 'keyboard'), { capture: true, passive: true })
}

/** The device behind the last pointerdown/keydown. Defaults to `keyboard` so a
 *  surface that has seen no input yet keeps the accessible behavior. */
export function lastInputModality(): InputModality {
  return modality
}
