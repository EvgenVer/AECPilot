/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/code-skew-error.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** True when a backend error is the post-update stale-module 503 (#97046). */
export function isCodeSkewRestartRequired(error: unknown): boolean {
  return /Restart required:/i.test(errorText(error))
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return typeof error === 'string' ? error : String(error ?? '')
}
