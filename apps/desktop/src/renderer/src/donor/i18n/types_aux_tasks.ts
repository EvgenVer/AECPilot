/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_aux_tasks.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Copy for one built-in auxiliary-model slot row (Settings → Models → Auxiliary models). */
export interface AuxTaskCopy {
  label: string
  hint: string
}

/** Built-in slot key → row copy; plugin slots bring their own label/hint from the backend. */
export type AuxTaskCopyMap = Record<string, AuxTaskCopy>
