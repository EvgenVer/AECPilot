// Task T89 debt: a profile where an earlier build turned the real-profile browser on is turned
// off on the next open — the forcing write, not the "only when missing" default.

import { describe, expect, it } from 'vitest'

import { forceSectionScalar } from './config-yaml-pure'

describe('real-profile browser forced off (HX36)', () => {
  it('turns an existing `true` off and keeps the other browser keys', () => {
    const text =
      'browser:\n  use_real_profile: true\n  allow_private_urls: false\nmodel:\n  default: x\n'
    const result = forceSectionScalar(text, 'browser', 'use_real_profile', false)
    expect(result.changed).toBe(true)
    expect(result.text).toContain('  use_real_profile: false')
    expect(result.text).toContain('  allow_private_urls: false')
    expect(result.text).not.toContain('use_real_profile: true')
  })

  it('writes `false` when the key is missing and changes nothing when it is already off', () => {
    expect(
      forceSectionScalar('model:\n  default: x\n', 'browser', 'use_real_profile', false).text
    ).toContain('use_real_profile: false')
    expect(
      forceSectionScalar(
        'browser:\n  use_real_profile: false\n',
        'browser',
        'use_real_profile',
        false
      ).changed
    ).toBe(false)
  })
})
