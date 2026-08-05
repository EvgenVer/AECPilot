/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/text.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Canonical text micro-helpers. Do not redefine these per-page.

export const asText = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

export const includesQuery = (v: unknown, q: string) => asText(v).toLowerCase().includes(q)

export const prettyName = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/** Search-key normalization: the exact `value.trim().toLowerCase()` idiom that
 *  was hand-written at ~30 filter/lookup sites. */
export const normalize = (v: unknown): string => asText(v).trim().toLowerCase()

/** Uppercase the first character, leave the rest. Matches the
 *  `s.charAt(0).toUpperCase() + s.slice(1)` idiom (empty-safe). */
export const capitalize = (v: string): string => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v)
