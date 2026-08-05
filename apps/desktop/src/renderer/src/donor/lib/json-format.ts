/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/json-format.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export type FormatJsonResult = { ok: true; text: string } | { ok: false; error: string }

export function tryFormatJson(raw: string): FormatJsonResult {
  const text = raw.trim()

  if (!text) {
    return { ok: true, text: raw }
  }

  try {
    return { ok: true, text: JSON.stringify(JSON.parse(text) as unknown, null, 2) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
