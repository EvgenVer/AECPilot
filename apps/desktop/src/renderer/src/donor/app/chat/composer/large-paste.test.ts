/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/large-paste.test.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { describe, expect, it } from 'vitest'

import { LARGE_PASTE_ATTACHMENT_THRESHOLD, pasteSizeLabel, shouldConvertPasteToAttachment } from './large-paste'

describe('large paste policy', () => {
  it('converts only pastes strictly past the threshold', () => {
    expect(shouldConvertPasteToAttachment('a'.repeat(LARGE_PASTE_ATTACHMENT_THRESHOLD))).toBe(false)
    expect(shouldConvertPasteToAttachment('a'.repeat(LARGE_PASTE_ATTACHMENT_THRESHOLD + 1))).toBe(true)
    expect(shouldConvertPasteToAttachment('a'.repeat(50_000), 0)).toBe(false)
  })

  it('labels the chip by encoded byte size, not character count', () => {
    expect(pasteSizeLabel('a'.repeat(512))).toBe('512 B')
    expect(pasteSizeLabel('\u00e9'.repeat(1024))).toBe('2.0 KB')
  })
})
