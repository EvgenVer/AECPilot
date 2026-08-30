/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/platform.ts
 * Commit:  5fc308a70719a83cccdbba4c0e39c23f5a8239d5 (v2026.8.27)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Platform detection for the renderer.
 *
 * The renderer has no `process.platform`, and several surfaces need to know
 * which OS they're on — keybind glyphs, terminal shortcuts, and glass. One
 * definition so they can't disagree.
 *
 * Win10 vs Win11 is not visible here (both report NT 10.0). The real glass
 * gate is `hermesDesktop.glassSupported`, which main/preload compute from
 * `os.release()`.
 */

export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent || '')

// Not `/win/i` — that matches the substring inside `darwin`, which is jsdom's
// default userAgent. Win32 / Windows NT are the real tokens.
export const isWindowsPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /win32|windows/i.test(navigator.platform || navigator.userAgent || '')

export const isLinuxPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /linux/i.test(navigator.platform || navigator.userAgent || '')
