/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/ui/drop-affordance.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Shared drag-and-drop visual language — ONE dashed accent sheet, used by every
 * drop affordance (the composer file/session overlay, the layout zone targets)
 * so "you can drop here" reads identically everywhere.
 */

/** The sheet: a dashed region marking where a drop would land. */
export const DROP_SHEET_CLASS = 'rounded-2xl border-2 border-dashed'

/** Soft blur for the LIVE sheet only — idle outlines must not fog the app. */
export const DROP_SHEET_BLUR_CLASS = 'backdrop-blur-[2px] [-webkit-backdrop-filter:blur(2px)]'
