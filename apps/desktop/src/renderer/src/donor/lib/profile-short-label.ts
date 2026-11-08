/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/profile-short-label.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
