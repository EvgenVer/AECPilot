/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/themes/chat-font.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Families users ask for by name; the app face is otherwise whatever the theme declares. */
export const CHAT_FONT_SUGGESTIONS = [
  'OpenDyslexic',
  'Atkinson Hyperlegible',
  'Lexend',
  'Inter',
  'IBM Plex Sans',
  'Source Sans 3',
  'Noto Sans',
  'Segoe UI',
  'SF Pro Text'
] as const

/** The profile-backed value as written in config.yaml. Empty means the theme's face. */
export const $chatFontFamily = atom('')

export function normalizeChatFontFamily(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function quoteSingleFamily(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * Accept a friendly single family name or an authored CSS font stack; the
 * theme's own stack stays behind it so missing glyphs (CJK, emoji) still resolve.
 */
export function resolveChatFontFamily(value: unknown, themeFontSans: string): string {
  const configured = normalizeChatFontFamily(value)

  if (!configured) {
    return themeFontSans
  }

  const preferred = configured.includes(',') || /['"]/.test(configured) ? configured : quoteSingleFamily(configured)

  return `${preferred}, ${themeFontSans}`
}

export function setChatFontFamilyFromConfig(value: unknown): void {
  $chatFontFamily.set(normalizeChatFontFamily(value))
}
