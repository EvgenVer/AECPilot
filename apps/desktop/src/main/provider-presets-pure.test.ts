// Task 3G.2 — provider presets for our modules (D-154, SPECIFICATION C5).

import { describe, expect, it } from 'vitest'
import { PROVIDER_PRESETS, resolveProvider } from './provider-presets-pure'

describe('PROVIDER_PRESETS', () => {
  it('gives Gemini and OpenAI an address, a key variable and every model role', () => {
    for (const id of ['gemini', 'openai-api'] as const) {
      const preset = PROVIDER_PRESETS[id]
      expect(preset.baseUrl).toMatch(/^https:\/\//)
      expect(preset.keyEnvVar).toMatch(/_API_KEY$/)
      expect(preset.models?.agent).toBeTruthy()
      expect(preset.models?.aux).toBeTruthy()
      expect(preset.models?.embedding).toBeTruthy()
      expect(preset.models).toHaveProperty('image')
    }
  })

  it('carries the Gemini models approved on 2026-09-28, and no image model (D-156)', () => {
    expect(PROVIDER_PRESETS.gemini.models).toEqual({
      agent: 'gemini-3.8-flash',
      aux: 'gemini-3.5-flash-lite',
      embedding: 'gemini-embedding-2',
      image: null
    })
  })
})

describe('resolveProvider', () => {
  it('resolves Gemini from the profile provider alone', () => {
    expect(resolveProvider({ provider: 'gemini' })).toMatchObject({
      ok: true,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      keyEnvVar: 'GEMINI_API_KEY'
    })
  })

  it('completes a custom address from the profile', () => {
    expect(
      resolveProvider({
        provider: 'custom:lab',
        baseUrl: 'http://127.0.0.1:1234/v1',
        keyEnvVar: 'LAB_API_KEY'
      })
    ).toEqual({
      ok: true,
      id: 'custom',
      baseUrl: 'http://127.0.0.1:1234/v1',
      keyEnvVar: 'LAB_API_KEY',
      models: null
    })
  })

  it('refuses a custom address without base_url or key variable', () => {
    expect(resolveProvider({ provider: 'custom', keyEnvVar: 'X_API_KEY' })).toMatchObject({
      ok: false
    })
    expect(resolveProvider({ provider: 'custom', baseUrl: 'http://h/v1' })).toMatchObject({
      ok: false
    })
  })

  it('refuses an unknown or missing provider in words — never falls back to OpenAI', () => {
    for (const provider of ['anthropic', '', null]) {
      const result = resolveProvider({ provider })
      expect(result.ok).toBe(false)
      expect(result).not.toHaveProperty('baseUrl')
      if (!result.ok) expect(result.reason).toBeTruthy()
    }
  })
})
