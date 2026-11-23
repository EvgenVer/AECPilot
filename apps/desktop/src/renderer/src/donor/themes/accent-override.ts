/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/accent-override.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Dev-only accent override.
 *
 * Live-authoring knob for `retintTheme`: while this holds a hex, the theme
 * context paints the active skin re-seeded from it. `null` means "off" — the
 * theme paints exactly as authored, which is the only state a production build
 * can ever be in (the picker that sets this is installed under
 * `import.meta.env.DEV`).
 *
 * Deliberately NOT persisted. It's a scratch control for finding a color you
 * like, and the outcome is meant to be written into `presets.ts` as a real
 * palette — not carried around as user state that would silently override a
 * theme the user picked later.
 */

import { atom } from 'nanostores'

import { normalizeHex } from './color'

export const $accentOverride = atom<null | string>(null)

export function setAccentOverride(color: null | string): void {
  $accentOverride.set(color === null ? null : (normalizeHex(color) ?? $accentOverride.get()))
}
