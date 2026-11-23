/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/profile-short-label.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
