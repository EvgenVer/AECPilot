/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/index.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
