/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/appearance-subpages.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
