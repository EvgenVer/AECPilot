/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/index.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export { ingestBackendSkin } from './backend-sync'
export { ThemeProvider, useTheme } from './context'
export { BUILTIN_THEME_LIST, BUILTIN_THEMES, DEFAULT_SKIN_NAME } from './presets'
export { requestTheme } from './request'
export { skinToDesktopTheme } from './skin'
export type { DesktopTheme, DesktopThemeColors, DesktopThemeTypography } from './types'
export type { HermesSkin } from '@hermes/shared/skin'
