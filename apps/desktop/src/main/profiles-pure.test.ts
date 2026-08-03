// Task 1.6.B5.23 — profiles. The list parser and the two refusals; the shapes
// come from `runtime/profiles-probe.mjs`, which ran against a live gateway
// before any of this was written.

import { describe, expect, it } from 'vitest'
import {
  describeProfileDeletion,
  isValidProfileName,
  parseActiveProfile,
  parseProfileList,
  refuseProfileDeletion
} from './profiles-pure'

// Verbatim from the probe's output — fourteen fields, of which this app uses
// six.
const MEASURED_ROW = {
  description: 'для смет',
  description_auto: false,
  distribution_name: null,
  distribution_source: null,
  distribution_version: null,
  gateway_running: false,
  has_alias: false,
  has_env: true,
  is_default: false,
  model: 'gpt-5',
  name: 'estimates',
  path: 'D:\\proj\\runtime\\dev-profile\\profiles\\estimates',
  provider: 'openai-api',
  skill_count: 12
}

describe('parseProfileList', () => {
  it('keeps the six fields the screen shows', () => {
    expect(parseProfileList({ profiles: [MEASURED_ROW] })).toEqual([
      {
        name: 'estimates',
        path: 'D:\\proj\\runtime\\dev-profile\\profiles\\estimates',
        isDefault: false,
        model: 'gpt-5',
        provider: 'openai-api',
        description: 'для смет',
        skillCount: 12
      }
    ])
  })

  it('drops a row with no name rather than showing a nameless profile', () => {
    expect(parseProfileList({ profiles: [{ path: 'x' }, MEASURED_ROW] })).toHaveLength(1)
  })

  it('treats an unexpected answer as an empty list', () => {
    expect(parseProfileList(undefined)).toEqual([])
    expect(parseProfileList({ profiles: 'нет' })).toEqual([])
  })

  it('leaves an absent optional field absent instead of inventing a blank', () => {
    const [row] = parseProfileList({ profiles: [{ name: 'bare' }] })
    expect(row?.model).toBeUndefined()
    expect(row?.skillCount).toBeUndefined()
  })
})

describe('parseActiveProfile', () => {
  it('keeps their two answers apart', () => {
    // `current` is what this process runs as; `active` is the sticky default
    // for future CLI runs. MEASURED: both are "default" on the dev profile,
    // which is exactly when confusing them goes unnoticed.
    expect(parseActiveProfile({ active: 'estimates', current: 'default' })).toEqual({
      active: 'estimates',
      current: 'default'
    })
  })

  it('falls back to default rather than to an empty name', () => {
    expect(parseActiveProfile(undefined)).toEqual({ active: 'default', current: 'default' })
  })
})

describe('isValidProfileName', () => {
  it('accepts ordinary names', () => {
    expect(isValidProfileName('estimates')).toBe(true)
    expect(isValidProfileName('proj-2026.1')).toBe(true)
  })

  it('refuses anything that could steer a URL path', () => {
    // Their DELETE route takes the name as a path segment.
    expect(isValidProfileName('../default')).toBe(false)
    expect(isValidProfileName('a/b')).toBe(false)
    expect(isValidProfileName('')).toBe(false)
    expect(isValidProfileName('.hidden')).toBe(false)
    expect(isValidProfileName(42)).toBe(false)
  })
})

describe('refuseProfileDeletion', () => {
  it('refuses the profile the gateway is running as', () => {
    expect(refuseProfileDeletion('estimates', 'estimates')).toContain('сейчас работает ядро')
  })

  it('refuses default, which is the hermes home itself', () => {
    expect(refuseProfileDeletion('default', 'estimates')).toContain('домашний каталог')
  })

  it('allows any other profile', () => {
    expect(refuseProfileDeletion('old', 'estimates')).toBeUndefined()
  })
})

describe('describeProfileDeletion', () => {
  it('names what actually goes with it', () => {
    const text = describeProfileDeletion('old')
    expect(text).toContain('old')
    expect(text).toContain('скилы')
    expect(text).toContain('сессий')
  })
})
