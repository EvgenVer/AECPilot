/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_theme_picker.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** The set_theme picker cards in the chat and their settled receipt. */
export interface ThemePickerCopy {
  accent: string
  layout: string
  mode: string
  customColor: string
  /** A settled accent that is the theme's own colour (no pick stored). */
  themeAccent: string
  basic: string
  basicDetail: string
  elite: string
  eliteDetail: string
  /** The card closed without a pick: dismissed, timed out, or answered in the composer. */
  noPick: string
}
