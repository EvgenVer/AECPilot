// Task 3G.2 — provider presets for our modules (D-154, SPECIFICATION C5).

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DATA_PROVIDERS,
  PROVIDER_PRESETS,
  memoryProvider,
  parseDataProviders,
  pendingEmbeddingSwitch,
  memoryProviderSettings,
  ragProvider,
  ragProviderEnv,
  readProfileProvider,
  resolveProvider
} from './provider-presets-pure'

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

describe('readProfileProvider', () => {
  it('reads the core model block, quoted or not, with comments around', () => {
    const yaml = [
      '# profile',
      'model:',
      '  default: gemini-3.8-flash',
      '  provider: "gemini"  # chosen in the donor screen',
      'toolsets:',
      '  - hermes-cli'
    ].join('\r\n')
    expect(readProfileProvider(yaml)).toEqual({
      provider: 'gemini',
      baseUrl: null,
      keyEnvVar: null
    })
  })

  it('finds the key variable of a named custom endpoint under providers:', () => {
    const yaml = [
      'model:',
      '  provider: custom:lab',
      '  base_url: http://127.0.0.1:1234/v1',
      'providers:',
      '  other:',
      '    key_env: OTHER_API_KEY',
      '  lab:',
      '    base_url: http://127.0.0.1:1234/v1',
      '    key_env: LAB_API_KEY'
    ].join('\n')
    expect(readProfileProvider(yaml)).toEqual({
      provider: 'custom:lab',
      baseUrl: 'http://127.0.0.1:1234/v1',
      keyEnvVar: 'LAB_API_KEY'
    })
  })

  it('returns nothing when the profile has no model block', () => {
    expect(readProfileProvider('toolsets: []\n').provider).toBeNull()
  })
})

describe('pendingEmbeddingSwitch (3G.7)', () => {
  it('reports a provider that now embeds with another model', () => {
    expect(
      pendingEmbeddingSwitch({
        builtWith: 'text-embedding-3-large',
        projectModel: '',
        providerModel: 'gemini-embedding-2'
      })
    ).toEqual({ from: 'text-embedding-3-large', to: 'gemini-embedding-2' })
  })

  it('lets the project setting win over the provider', () => {
    expect(
      pendingEmbeddingSwitch({
        builtWith: 'm1',
        projectModel: 'm1',
        providerModel: 'gemini-embedding-2'
      })
    ).toBeNull()
  })

  it('is silent without an index or without a model to compare', () => {
    expect(
      pendingEmbeddingSwitch({ builtWith: null, projectModel: null, providerModel: 'x' })
    ).toBeNull()
    expect(
      pendingEmbeddingSwitch({ builtWith: 'x', projectModel: null, providerModel: null })
    ).toBeNull()
  })
})

describe('memoryProviderSettings (3G.4, D-157)', () => {
  it('gives Mem0 the Gemini address, the key variable NAME and the measured width', () => {
    expect(memoryProviderSettings(resolveProvider({ provider: 'gemini' }))).toEqual({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      keyEnvVar: 'GEMINI_API_KEY',
      llmModel: 'gemini-3.5-flash-lite',
      embeddingModel: 'gemini-embedding-2',
      embeddingDims: 3072
    })
  })

  it('keeps the memory embedder OpenAI users already have, so their facts stay', () => {
    expect(memoryProviderSettings(resolveProvider({ provider: 'openai-api' }))).toMatchObject({
      keyEnvVar: 'OPENAI_API_KEY',
      embeddingModel: 'text-embedding-3-small',
      embeddingDims: 1536
    })
  })

  it('is null without a provider and for a custom address', () => {
    expect(memoryProviderSettings(resolveProvider({ provider: null }))).toBeNull()
    expect(
      memoryProviderSettings(
        resolveProvider({ provider: 'custom:lab', baseUrl: 'http://x', keyEnvVar: 'LAB_KEY' })
      )
    ).toBeNull()
  })
})

describe('ragProviderEnv', () => {
  it('passes Gemini names and models to aec-rag, never a key value', () => {
    const env = ragProviderEnv(resolveProvider({ provider: 'gemini' }))
    expect(env).toEqual({
      AEC_RAG_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      AEC_RAG_KEY_ENV: 'GEMINI_API_KEY',
      AEC_RAG_EMBEDDING_MODEL: 'gemini-embedding-2',
      AEC_RAG_EXTRACTION_MODEL: 'gemini-3.8-flash'
    })
  })

  it('is empty without a usable provider', () => {
    expect(ragProviderEnv(resolveProvider({ provider: null }))).toEqual({})
  })
})

// Task 3G.46 (D-172): RAG and memory get their own provider choice — by default one,
// following the agent; a subscription agent has no address our modules can use.
describe('parseDataProviders (3G.46)', () => {
  it('defaults to «as the agent» for RAG and «as RAG» for memory when there is no file', () => {
    expect(parseDataProviders(null)).toEqual(DEFAULT_DATA_PROVIDERS)
    expect(parseDataProviders('not json')).toEqual(DEFAULT_DATA_PROVIDERS)
    expect(parseDataProviders('{"rag":{"provider":"openai-codex"}}')).toEqual(
      DEFAULT_DATA_PROVIDERS
    )
  })

  it('reads both choices with their models', () => {
    const text = JSON.stringify({
      rag: {
        provider: 'gemini',
        embedding: 'gemini-embedding-2',
        extraction: 'gemini-3.5-flash-lite'
      },
      memory: {
        provider: 'custom',
        base_url: 'http://lab/v1',
        key_env: 'LAB_KEY',
        llm: 'm',
        embedding: 'e',
        embedding_dims: 768
      }
    })
    expect(parseDataProviders(text)).toEqual({
      rag: {
        provider: 'gemini',
        embedding: 'gemini-embedding-2',
        extraction: 'gemini-3.5-flash-lite'
      },
      memory: {
        provider: 'custom',
        baseUrl: 'http://lab/v1',
        keyEnvVar: 'LAB_KEY',
        llm: 'm',
        embedding: 'e',
        embeddingDims: 768
      }
    })
  })
})

describe('ragProvider and memoryProvider (3G.46)', () => {
  const codex = { provider: 'openai-codex' }

  it('without a file behave as before: the agent provider for both', () => {
    const rag = ragProvider({ provider: 'gemini' }, DEFAULT_DATA_PROVIDERS)
    expect(rag).toEqual({ ok: true, env: ragProviderEnv(resolveProvider({ provider: 'gemini' })) })
    const memory = memoryProvider({ provider: 'gemini' }, DEFAULT_DATA_PROVIDERS)
    expect(memory).toEqual({
      ok: true,
      settings: memoryProviderSettings(resolveProvider({ provider: 'gemini' }))
    })
  })

  it('refuse in words for a subscription agent with no choice made, naming the setting', () => {
    for (const result of [
      ragProvider(codex, DEFAULT_DATA_PROVIDERS),
      memoryProvider(codex, DEFAULT_DATA_PROVIDERS)
    ]) {
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toContain('openai-codex')
        expect(result.reason).toContain('Индекс и память')
      }
    }
  })

  it('a RAG choice serves a subscription agent, and memory follows it by default', () => {
    const choice = parseDataProviders('{"rag":{"provider":"gemini"}}')
    expect(ragProvider(codex, choice)).toEqual({
      ok: true,
      env: {
        AEC_RAG_BASE_URL: PROVIDER_PRESETS.gemini.baseUrl,
        AEC_RAG_KEY_ENV: 'GEMINI_API_KEY',
        AEC_RAG_EMBEDDING_MODEL: 'gemini-embedding-2',
        AEC_RAG_EXTRACTION_MODEL: 'gemini-3.8-flash'
      }
    })
    expect(memoryProvider(codex, choice)).toEqual({
      ok: true,
      settings: {
        baseUrl: PROVIDER_PRESETS.gemini.baseUrl,
        keyEnvVar: 'GEMINI_API_KEY',
        llmModel: 'gemini-3.5-flash-lite',
        embeddingModel: 'gemini-embedding-2',
        embeddingDims: 3072
      }
    })
  })

  it('RAG and memory can be given different providers', () => {
    const choice = parseDataProviders(
      '{"rag":{"provider":"gemini"},"memory":{"provider":"openai-api"}}'
    )
    const rag = ragProvider(codex, choice)
    const memory = memoryProvider(codex, choice)
    expect(rag.ok && rag.env.AEC_RAG_KEY_ENV).toBe('GEMINI_API_KEY')
    expect(memory.ok && memory.settings.keyEnvVar).toBe('OPENAI_API_KEY')
    expect(memory.ok && memory.settings.embeddingModel).toBe('text-embedding-3-small')
  })

  it('chosen models go over the preset ones', () => {
    const choice = parseDataProviders(
      JSON.stringify({
        rag: { provider: 'agent', embedding: 'text-embedding-3-small', extraction: 'gpt-5-nano' },
        memory: {
          provider: 'rag',
          llm: 'gpt-5-nano',
          embedding: 'text-embedding-3-large',
          embedding_dims: 3072
        }
      })
    )
    const rag = ragProvider({ provider: 'openai-api' }, choice)
    expect(rag.ok && rag.env.AEC_RAG_EMBEDDING_MODEL).toBe('text-embedding-3-small')
    expect(rag.ok && rag.env.AEC_RAG_EXTRACTION_MODEL).toBe('gpt-5-nano')
    const memory = memoryProvider({ provider: 'openai-api' }, choice)
    expect(memory).toMatchObject({
      ok: true,
      settings: {
        llmModel: 'gpt-5-nano',
        embeddingModel: 'text-embedding-3-large',
        embeddingDims: 3072
      }
    })
  })

  it('memory refuses a chosen embedder whose vector width was never measured', () => {
    const choice = parseDataProviders(
      '{"memory":{"provider":"gemini","embedding":"other-embedder"}}'
    )
    const memory = memoryProvider(codex, choice)
    expect(memory.ok).toBe(false)
  })

  it('a custom address without models is refused, not half-configured', () => {
    const choice = parseDataProviders(
      '{"rag":{"provider":"custom","base_url":"http://lab/v1","key_env":"LAB_KEY"}}'
    )
    expect(ragProvider(codex, choice).ok).toBe(false)
    expect(memoryProvider(codex, choice).ok).toBe(false)
  })
})
