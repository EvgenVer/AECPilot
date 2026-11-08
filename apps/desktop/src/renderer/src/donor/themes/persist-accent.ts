/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/persist-accent.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { setAccentOverride } from './accent-override'
import { normalizeHex } from './color'
import { accentBase, accentedTheme, committedTheme } from './context'
import { requestTheme } from './request'
import { installUserTheme } from './user-themes'

/**
 * Save an accent on the live profile's theme: only its accent moves, saved as the `<base>-accent-<hex>` user theme
 * the `$accentOverride` preview painted. `null` (or the base's own accent) returns to the base theme itself.
 * Clears the unsaved preview. An unparseable colour changes nothing.
 */
export function persistAccent(accent: null | string): void {
  const hex = accent === null ? null : normalizeHex(accent)

  if (accent !== null && !hex) {
    return
  }

  const active = committedTheme()
  const next = hex === null ? accentBase(active) : accentedTheme(active, hex)

  requestTheme(next.accentOf ? installUserTheme(next).name : next.name)
  setAccentOverride(null)
}

/** The accent the live theme's own palette carries, for previewing a return to it. */
export const ownAccent = (): string => accentBase(committedTheme()).colors.primary
