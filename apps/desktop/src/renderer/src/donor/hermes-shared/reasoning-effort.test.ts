/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/shared/src/reasoning-effort.test.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_REASONING_EFFORT,
  isReasoningEffort,
  REASONING_EFFORT_VALUES,
  REASONING_EFFORTS
} from './reasoning-effort'

describe('reasoning-effort', () => {
  it('is one duplicate-free value set with `none` as the only non-level', () => {
    expect(new Set(REASONING_EFFORT_VALUES).size).toBe(REASONING_EFFORT_VALUES.length)
    expect(REASONING_EFFORT_VALUES.filter(v => !isReasoningEffort(v))).toEqual(['none'])
  })

  it('defaults to a real level and recognizes it case-insensitively', () => {
    expect(REASONING_EFFORTS).toContain(DEFAULT_REASONING_EFFORT)
    expect(isReasoningEffort(DEFAULT_REASONING_EFFORT.toUpperCase())).toBe(true)
  })
})
