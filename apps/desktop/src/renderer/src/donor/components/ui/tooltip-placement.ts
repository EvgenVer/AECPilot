/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/tooltip-placement.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export type TooltipPlacement = 'control' | 'row' | 'toolbar' | 'left-rail' | 'right-rail'

/** Preferred sides express intent; Radix still flips and shifts for available space. */
export const TOOLTIP_PLACEMENTS = {
  control: { side: 'top', align: 'center' },
  row: { side: 'right', align: 'center' },
  toolbar: { side: 'bottom', align: 'center' },
  'left-rail': { side: 'right', align: 'center' },
  'right-rail': { side: 'left', align: 'center' }
} as const
