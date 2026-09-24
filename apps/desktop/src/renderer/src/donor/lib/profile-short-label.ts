/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/profile-short-label.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
const profileGraphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Keep combining marks and emoji sequences together without changing the rail's size. */
export function profileShortLabel(label: string): string {
  for (const { segment } of profileGraphemes.segment(label.trim())) {
    if (/[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(segment)) {
      return segment
    }
  }

  return '?'
}
