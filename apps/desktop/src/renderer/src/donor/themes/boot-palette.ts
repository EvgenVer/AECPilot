/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/boot-palette.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The theme colours the boot-failure notice (src/lib/boot-failure.ts) paints itself with when
// the app could not load. Written as one snapshot, so a failed write can never pair one theme's
// background with another's ink, and only when each colour stands alone: a `var()` resolves to
// nothing without the app's styles. The notice reads the same key with its own copy of this
// check, so the renderer entry never fetches theme code; boot-palette.test.ts round-trips them.
const KEY = 'hermes-boot-palette'

export interface BootPalette {
  background: string
  foreground: string
  accent: string
  accentForeground: string
}

export function writeBootPalette(palette: BootPalette): void {
  try {
    if (Object.values(palette).every(value => value.trim() !== '' && !/var\(/i.test(value))) {
      localStorage.setItem(KEY, JSON.stringify(palette))
    } else {
      localStorage.removeItem(KEY)
    }
  } catch {
    // A write that failed must not leave an older theme's snapshot behind.
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Storage is unavailable: the notice stays neutral.
    }
  }
}
