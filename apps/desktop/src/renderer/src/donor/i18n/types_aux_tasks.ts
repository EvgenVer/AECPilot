/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_aux_tasks.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
