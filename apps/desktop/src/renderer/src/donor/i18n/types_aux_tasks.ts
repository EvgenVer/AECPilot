/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_aux_tasks.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
