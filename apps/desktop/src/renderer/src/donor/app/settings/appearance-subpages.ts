/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/appearance-subpages.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] registration table: dropped the pet subpage (HX1)
 * (no other edits)
 */
export const APPEARANCE_SUBPAGES = [
  { id: 'general', labelKey: 'appearanceGeneral' },
  { id: 'theme', labelKey: 'appearanceTheme' },
  { id: 'typography', labelKey: 'appearanceTypography' },
  { id: 'window-layout', labelKey: 'appearanceWindowLayout' },
  { id: 'chat-display', labelKey: 'appearanceChatDisplay' }
  // EDIT [3]: the pet subpage is HX1.
] as const

export type AppearanceSubpageId = (typeof APPEARANCE_SUBPAGES)[number]['id']
