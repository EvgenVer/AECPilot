// Pure unit tests for task 0.15's LLM-settings logic (no electron import —
// runs directly under vitest's node environment).

import { describe, expect, it } from 'vitest'
import {
  envVarIsDefined,
  mergeModelIntoConfigYaml,
  validateSaveLlmSettingsPayload
} from './llm-settings-pure'

const SAMPLE_CONFIG = `# Dev-profile config for the isolated hermes runtime (task 0.8).
# Main model: OpenAI, cheap default (gpt-5-mini). Key lives in .env, not here.
model:
  default: "gpt-5-mini"
  provider: "openai-api"
`

describe('mergeModelIntoConfigYaml', () => {
  it('sets model.default when a model override is given', () => {
    const result = mergeModelIntoConfigYaml(SAMPLE_CONFIG, { model: 'gpt-5' })

    expect(result.changed).toBe(true)
    expect(result.unexpectedStructure).toBe(false)
    expect(result.text).toContain('default: "gpt-5"')
    expect(result.text).toContain('provider: "openai-api"')
  })

  it('adds base_url when none exists yet, preserving provider', () => {
    const result = mergeModelIntoConfigYaml(SAMPLE_CONFIG, {
      baseUrl: 'https://example.com/v1'
    })

    expect(result.changed).toBe(true)
    expect(result.text).toContain('base_url: "https://example.com/v1"')
    expect(result.text).toContain('provider: "openai-api"')
    expect(result.text).toContain('default: "gpt-5-mini"')
  })

  it('updates an existing base_url in place instead of duplicating it', () => {
    const withBaseUrl = SAMPLE_CONFIG.replace(
      'provider: "openai-api"',
      'provider: "openai-api"\n  base_url: "https://old.example.com/v1"'
    )

    const result = mergeModelIntoConfigYaml(withBaseUrl, {
      baseUrl: 'https://new.example.com/v1'
    })

    expect(result.text).toContain('base_url: "https://new.example.com/v1"')
    expect(result.text).not.toContain('old.example.com')
    expect((result.text.match(/base_url:/g) ?? []).length).toBe(1)
  })

  it('preserves unrelated lines and comments outside the model: mapping', () => {
    const result = mergeModelIntoConfigYaml(SAMPLE_CONFIG, { model: 'gpt-5' })

    expect(result.text).toContain(
      '# Dev-profile config for the isolated hermes runtime (task 0.8).'
    )
    expect(result.text).toContain(
      '# Main model: OpenAI, cheap default (gpt-5-mini). Key lives in .env, not here.'
    )
  })

  it('sets both model.default and base_url together', () => {
    const result = mergeModelIntoConfigYaml(SAMPLE_CONFIG, {
      model: 'gpt-5',
      baseUrl: 'https://example.com/v1'
    })

    expect(result.text).toContain('default: "gpt-5"')
    expect(result.text).toContain('base_url: "https://example.com/v1"')
    expect(result.text).toContain('provider: "openai-api"')
  })

  it('is a no-op returning the original text when no overrides are given', () => {
    const result = mergeModelIntoConfigYaml(SAMPLE_CONFIG, {})

    expect(result.text).toBe(SAMPLE_CONFIG)
    expect(result.changed).toBe(false)
    expect(result.unexpectedStructure).toBe(false)
  })

  it('returns the input unchanged and flags unexpectedStructure when there is no model: mapping', () => {
    const weird = 'foo: bar\nbaz: qux\n'

    const result = mergeModelIntoConfigYaml(weird, { model: 'gpt-5' })

    expect(result.text).toBe(weird)
    expect(result.changed).toBe(false)
    expect(result.unexpectedStructure).toBe(true)
  })

  it('does not merge into a later top-level section by mistake', () => {
    const withTrailingSection = `${SAMPLE_CONFIG}\nother:\n  default: "should-not-change"\n`

    const result = mergeModelIntoConfigYaml(withTrailingSection, { model: 'gpt-5' })

    expect(result.text).toContain('other:\n  default: "should-not-change"')
    expect(result.text).toContain('model:\n  default: "gpt-5"')
  })

  it('quotes/escapes a base_url containing special characters so it round-trips', () => {
    const baseUrl = 'https://x.example/v1?a=b:c"d'

    const result = mergeModelIntoConfigYaml(SAMPLE_CONFIG, { baseUrl })

    expect(result.changed).toBe(true)
    // The value is emitted via JSON.stringify, so the colon and embedded quote
    // are escaped into a valid double-quoted scalar rather than breaking the line.
    const line = result.text.split('\n').find((l) => /^\s*base_url:/.test(l))
    expect(line).toBe(`  base_url: ${JSON.stringify(baseUrl)}`)
    const emittedValue = line!.replace(/^\s*base_url:\s*/, '')
    expect(JSON.parse(emittedValue)).toBe(baseUrl)
  })
})

describe('envVarIsDefined', () => {
  it('matches a plain VAR= assignment', () => {
    expect(envVarIsDefined('OPENAI_API_KEY=sk-secret-value\n', 'OPENAI_API_KEY')).toBe(true)
  })

  it('matches an indented assignment with spaces around =', () => {
    expect(envVarIsDefined('  OPENAI_API_KEY = sk-secret-value\n', 'OPENAI_API_KEY')).toBe(true)
  })

  it('ignores a commented-out assignment', () => {
    expect(envVarIsDefined('#OPENAI_API_KEY=sk-secret-value\n', 'OPENAI_API_KEY')).toBe(false)
  })

  it('ignores a different variable name', () => {
    expect(envVarIsDefined('ANTHROPIC_API_KEY=sk-secret-value\n', 'OPENAI_API_KEY')).toBe(false)
  })

  it('returns false for an empty file', () => {
    expect(envVarIsDefined('', 'OPENAI_API_KEY')).toBe(false)
  })

  it('never returns the assigned value itself', () => {
    // Regression guard: the returned type is boolean, not the matched
    // fragment — this test would fail to compile if the function ever
    // started returning the value instead.
    const result: boolean = envVarIsDefined('OPENAI_API_KEY=sk-super-secret\n', 'OPENAI_API_KEY')
    expect(result).toBe(true)
    expect(typeof result).toBe('boolean')
  })
})

describe('validateSaveLlmSettingsPayload', () => {
  it('accepts an empty object (all fields omitted)', () => {
    const result = validateSaveLlmSettingsPayload({})
    expect(result).toEqual({
      ok: true,
      payload: { model: undefined, baseUrl: undefined, key: undefined }
    })
  })

  it('accepts a fully-populated payload', () => {
    const result = validateSaveLlmSettingsPayload({
      model: 'gpt-5',
      baseUrl: 'https://example.com/v1',
      key: 'sk-new-key'
    })
    expect(result).toEqual({
      ok: true,
      payload: { model: 'gpt-5', baseUrl: 'https://example.com/v1', key: 'sk-new-key' }
    })
  })

  it('accepts key: null as a clear instruction', () => {
    const result = validateSaveLlmSettingsPayload({ key: null })
    expect(result).toEqual({
      ok: true,
      payload: { model: undefined, baseUrl: undefined, key: null }
    })
  })

  it('rejects a non-object payload', () => {
    const result = validateSaveLlmSettingsPayload('not-an-object')
    expect(result.ok).toBe(false)
  })

  it('rejects null', () => {
    const result = validateSaveLlmSettingsPayload(null)
    expect(result.ok).toBe(false)
  })

  it('rejects a non-string model', () => {
    const result = validateSaveLlmSettingsPayload({ model: 42 })
    expect(result).toEqual({ ok: false, error: 'model must be a string' })
  })

  it('rejects a non-string baseUrl', () => {
    const result = validateSaveLlmSettingsPayload({ baseUrl: 42 })
    expect(result).toEqual({ ok: false, error: 'baseUrl must be a string' })
  })

  it('rejects a key that is neither string nor null', () => {
    const result = validateSaveLlmSettingsPayload({ key: 42 })
    expect(result).toEqual({ ok: false, error: 'key must be a string, null, or omitted' })
  })
})
