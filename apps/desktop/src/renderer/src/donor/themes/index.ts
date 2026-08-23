/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/index.ts
 * Commit:  fcbd1076a93841fa88855acce810e342a5b78101 (v2026.8.19)
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
