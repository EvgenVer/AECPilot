/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_theme_picker.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
