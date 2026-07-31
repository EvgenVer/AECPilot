// Pure unit tests for task 0.15's LLM-settings logic (no electron import —
// runs directly under vitest's node environment).

import { describe, expect, it } from 'vitest'
import {
  buildProviderEnv,
  envVarIsDefined,
  isApprovalMode,
  isCredentialEnvVarName,
  mergeApprovalsModeIntoConfigYaml,
  mergeModelIntoConfigYaml,
  migrateProviderKeys,
  parseApprovalsMode,
  validateSaveLlmSettingsPayload
} from './llm-settings-pure'

describe('provider keys (task 1.6.B2.5)', () => {
  describe('migrateProviderKeys', () => {
    it('carries the task-0.15 single key into its env var slot', () => {
      expect(migrateProviderKeys({ encryptedKey: 'CIPHER' }, 'OPENAI_API_KEY')).toEqual({
        OPENAI_API_KEY: 'CIPHER'
      })
    })

    it('is idempotent — a migrated file migrates to itself', () => {
      const once = migrateProviderKeys({ encryptedKey: 'CIPHER' }, 'OPENAI_API_KEY')
      expect(migrateProviderKeys({ providerKeys: once }, 'OPENAI_API_KEY')).toEqual(once)
    })

    it('lets an explicit entry win over the legacy field', () => {
      expect(
        migrateProviderKeys(
          { encryptedKey: 'OLD', providerKeys: { OPENAI_API_KEY: 'NEW' } },
          'OPENAI_API_KEY'
        )
      ).toEqual({ OPENAI_API_KEY: 'NEW' })
    })

    it('keeps other providers untouched while migrating', () => {
      expect(
        migrateProviderKeys(
          { encryptedKey: 'LEGACY', providerKeys: { XAI_API_KEY: 'X' } },
          'OPENAI_API_KEY'
        )
      ).toEqual({ XAI_API_KEY: 'X', OPENAI_API_KEY: 'LEGACY' })
    })

    it('drops entries that are not a valid env var name or not a string', () => {
      expect(
        migrateProviderKeys(
          {
            providerKeys: {
              'BAD NAME': 'x',
              'PATH=INJECT': 'x',
              lowercase: 'x',
              GOOD_KEY: 'ok',
              EMPTY_KEY: '',
              NUMERIC: 7 as unknown as string
            }
          },
          'OPENAI_API_KEY'
        )
      ).toEqual({ GOOD_KEY: 'ok' })
    })

    it('reads a corrupt providerKeys value as no keys at all', () => {
      expect(migrateProviderKeys({ providerKeys: 'nope' }, 'OPENAI_API_KEY')).toEqual({})
      expect(migrateProviderKeys({}, 'OPENAI_API_KEY')).toEqual({})
    })
  })

  describe('buildProviderEnv', () => {
    it('decrypts every stored provider into the spawn env', () => {
      expect(
        buildProviderEnv({ OPENAI_API_KEY: 'a', XAI_API_KEY: 'b' }, (c) => `plain-${c}`)
      ).toEqual({ OPENAI_API_KEY: 'plain-a', XAI_API_KEY: 'plain-b' })
    })

    // Passing the ciphertext through would look like a wrong key to the
    // provider — a confusing failure a long way from its cause.
    it('skips an entry that fails to decrypt rather than passing the ciphertext on', () => {
      expect(
        buildProviderEnv({ OK_KEY: 'a', BROKEN_KEY: 'b' }, (c) => (c === 'a' ? 'plain' : undefined))
      ).toEqual({ OK_KEY: 'plain' })
    })

    it('is empty for an empty store', () => {
      expect(buildProviderEnv({}, () => 'x')).toEqual({})
    })
  })

  describe('isCredentialEnvVarName', () => {
    it('accepts the SCREAMING_SNAKE names providers actually use', () => {
      expect(isCredentialEnvVarName('OPENAI_API_KEY')).toBe(true)
      expect(isCredentialEnvVarName('XAI_API_KEY')).toBe(true)
    })

    it('rejects anything that could smuggle a second assignment into the env', () => {
      for (const bad of ['PATH=x', 'A B', 'lower_case', '', 'AB', '1ABC', 'A'.repeat(65)]) {
        expect(isCredentialEnvVarName(bad)).toBe(false)
      }
      expect(isCredentialEnvVarName(undefined)).toBe(false)
      expect(isCredentialEnvVarName(42)).toBe(false)
    })
  })
})

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

describe('isApprovalMode', () => {
  it('accepts the three whitelisted modes', () => {
    expect(isApprovalMode('manual')).toBe(true)
    expect(isApprovalMode('smart')).toBe(true)
    expect(isApprovalMode('off')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isApprovalMode('yolo')).toBe(false)
    expect(isApprovalMode('')).toBe(false)
    expect(isApprovalMode(42)).toBe(false)
    expect(isApprovalMode(undefined)).toBe(false)
  })
})

describe('parseApprovalsMode', () => {
  it('defaults to manual when there is no approvals: block', () => {
    expect(parseApprovalsMode('model:\n  default: "gpt-5-mini"\n')).toBe('manual')
  })

  it('defaults to manual for an empty file', () => {
    expect(parseApprovalsMode('')).toBe('manual')
  })

  it('reads a bare (YAML-boolean) off as off', () => {
    expect(parseApprovalsMode('approvals:\n  mode: off\n')).toBe('off')
  })

  it('reads a quoted mode as-is', () => {
    expect(parseApprovalsMode('approvals:\n  mode: "smart"\n')).toBe('smart')
  })

  it('reads a single-quoted mode as-is', () => {
    expect(parseApprovalsMode("approvals:\n  mode: 'smart'\n")).toBe('smart')
  })

  it('maps the literal string false to off, mirroring hermes normalization', () => {
    expect(parseApprovalsMode('approvals:\n  mode: false\n')).toBe('off')
  })

  it('maps the literal string true to manual, mirroring hermes normalization', () => {
    expect(parseApprovalsMode('approvals:\n  mode: true\n')).toBe('manual')
  })

  it('falls back to manual (with a warning, not a throw) for an unknown value', () => {
    expect(parseApprovalsMode('approvals:\n  mode: banana\n')).toBe('manual')
  })

  it('falls back to manual when the block exists but has no mode: line', () => {
    expect(parseApprovalsMode('approvals:\n  timeout: 30\n')).toBe('manual')
  })

  it('tolerates a trailing inline comment', () => {
    expect(parseApprovalsMode('approvals:\n  mode: smart  # LLM decides\n')).toBe('smart')
  })

  it('never throws on malformed input', () => {
    expect(() => parseApprovalsMode('approvals:')).not.toThrow()
  })

  it('reads the block header with a trailing comment (approvals:  # human approvals)', () => {
    expect(parseApprovalsMode('approvals:  # human approvals\n  mode: "smart"\n')).toBe('smart')
  })
})

describe('mergeApprovalsModeIntoConfigYaml', () => {
  const WITH_APPROVALS = `model:\n  default: "gpt-5-mini"\napprovals:\n  mode: "manual"\n  timeout: 30\n`

  it('updates an existing mode: line in place, preserving the timeout sibling', () => {
    const result = mergeApprovalsModeIntoConfigYaml(WITH_APPROVALS, 'smart')

    expect(result.changed).toBe(true)
    expect(result.unexpectedStructure).toBe(false)
    expect(result.text).toContain('mode: "smart"')
    expect(result.text).toContain('timeout: 30')
    expect(result.text).toContain('default: "gpt-5-mini"')
    expect((result.text.match(/mode:/g) ?? []).length).toBe(1)
  })

  it('appends a new approvals: block with the exact shape when absent', () => {
    const original = 'model:\n  default: "gpt-5-mini"\n'
    const result = mergeApprovalsModeIntoConfigYaml(original, 'smart')

    expect(result.changed).toBe(true)
    expect(result.unexpectedStructure).toBe(false)
    expect(result.text).toBe(`${original}approvals:\n  mode: "smart"\n`)
  })

  it('appends a new block with a separating newline when the file lacks a trailing one', () => {
    const original = 'model:\n  default: "gpt-5-mini"'
    const result = mergeApprovalsModeIntoConfigYaml(original, 'off')

    expect(result.text).toBe(`${original}\napprovals:\n  mode: "off"\n`)
  })

  it('is idempotent: changed is false and text is untouched when the mode already matches', () => {
    const result = mergeApprovalsModeIntoConfigYaml(WITH_APPROVALS, 'manual')

    expect(result.changed).toBe(false)
    expect(result.unexpectedStructure).toBe(false)
    expect(result.text).toBe(WITH_APPROVALS)
  })

  it('is idempotent when the block is absent and the requested mode is the default (manual)', () => {
    const original = 'model:\n  default: "gpt-5-mini"\n'
    const result = mergeApprovalsModeIntoConfigYaml(original, 'manual')

    expect(result.changed).toBe(false)
    expect(result.text).toBe(original)
  })

  it('preserves the rest of the file byte-for-byte outside the approvals: block', () => {
    const result = mergeApprovalsModeIntoConfigYaml(WITH_APPROVALS, 'off')

    expect(result.text).toContain('model:\n  default: "gpt-5-mini"\n')
  })

  it('flags unexpectedStructure and leaves input unchanged for a scalar approvals: off', () => {
    const scalar = 'model:\n  default: "gpt-5-mini"\napprovals: off\n'
    const result = mergeApprovalsModeIntoConfigYaml(scalar, 'smart')

    expect(result.changed).toBe(false)
    expect(result.unexpectedStructure).toBe(true)
    expect(result.text).toBe(scalar)
  })

  it('updates mode: in place under a block header with a trailing comment, preserving the header', () => {
    const withComment =
      'model:\n  default: "gpt-5-mini"\napprovals:  # human approvals\n  mode: "manual"\n'
    const result = mergeApprovalsModeIntoConfigYaml(withComment, 'off')

    expect(result.changed).toBe(true)
    expect(result.unexpectedStructure).toBe(false)
    expect(result.text).toContain('approvals:  # human approvals\n')
    expect(result.text).toContain('mode: "off"')
  })

  it('quotes the written value via JSON.stringify', () => {
    const result = mergeApprovalsModeIntoConfigYaml('model:\n  default: "x"\n', 'off')
    const line = result.text.split('\n').find((l) => /^\s*mode:/.test(l))
    expect(line).toBe(`  mode: ${JSON.stringify('off')}`)
  })
})
