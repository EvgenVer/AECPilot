/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/tooltip-placement.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
