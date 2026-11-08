/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/json-format.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
