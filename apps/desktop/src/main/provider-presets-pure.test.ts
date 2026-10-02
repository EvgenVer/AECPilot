// Task 3G.2 — provider presets for our modules (D-154, SPECIFICATION C5).

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DATA_PROVIDERS,
  dataKeyEnvVars,
  dataSectionProvider,
  embeddingChangeWarnings,
  embeddingProbeTarget,
  keepMeasuredWidth,
  memoryEmbeddingModel,
  parseEmbeddingWidth,
  parseModelIds,
  PROVIDER_PRESETS,
  memoryProvider,
  parseDataProviders,
  pendingEmbeddingSwitch,
  memoryProviderSettings,
  ragProvider,
  serializeDataProviders,
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

describe('serializeDataProviders (3G.47)', () => {
  it('writes the file shape back, and reading it gives the same choice', () => {
    const choice = parseDataProviders(
      JSON.stringify({
        rag: {
          provider: 'custom',
          base_url: 'http://lab/v1',
          key_env: 'LAB_KEY',
          embedding: 'e',
          extraction: 'x'
        },
        memory: { provider: 'gemini', llm: 'gemini-3.5-flash-lite' }
      })
    )
    const file = serializeDataProviders(choice)
    expect(file).toEqual({
      rag: {
        provider: 'custom',
        base_url: 'http://lab/v1',
        key_env: 'LAB_KEY',
        embedding: 'e',
        extraction: 'x'
      },
      memory: { provider: 'gemini', llm: 'gemini-3.5-flash-lite' }
    })
    expect(parseDataProviders(JSON.stringify(file))).toEqual(choice)
  })

  it('names the key variables the choice needs, without the agent ones', () => {
    expect(dataKeyEnvVars(DEFAULT_DATA_PROVIDERS)).toEqual([])
    expect(
      dataKeyEnvVars(
        parseDataProviders('{"rag":{"provider":"gemini"},"memory":{"provider":"openai-api"}}')
      )
    ).toEqual(['GEMINI_API_KEY', 'OPENAI_API_KEY'])
    expect(
      dataKeyEnvVars(
        parseDataProviders(
          '{"rag":{"provider":"custom","base_url":"http://x","key_env":"LAB_KEY"}}'
        )
      )
    ).toEqual(['LAB_KEY'])
  })
})

describe('модели из списка провайдера (3G.52)', () => {
  const gemini = { provider: 'gemini' }
  const codex = { provider: 'openai-codex' }
  const noIndex = { builtWith: null, projectModel: null }

  it('список моделей — id без приставки `models/` Gemini, без повторов, по алфавиту', () => {
    expect(
      parseModelIds({
        data: [{ id: 'models/gemini-embedding-2' }, { id: 'gpt-5-mini' }, { id: 'gpt-5-mini' }, {}]
      })
    ).toEqual(['gemini-embedding-2', 'gpt-5-mini'])
    expect(parseModelIds({ error: 'nope' })).toEqual([])
    expect(parseModelIds(null)).toEqual([])
  })

  it('ширина вектора — длина первого эмбеддинга; пустой ответ — null', () => {
    expect(parseEmbeddingWidth({ data: [{ embedding: [0.1, 0.2, 0.3] }] })).toBe(3)
    expect(parseEmbeddingWidth({ data: [] })).toBeNull()
    expect(parseEmbeddingWidth('oops')).toBeNull()
  })

  it('провайдер раздела: память «как у RAG» читает список RAG', () => {
    const choices = parseDataProviders('{"rag":{"provider":"openai-api"}}')
    const memory = dataSectionProvider(codex, choices, 'memory')
    expect(memory.ok && memory.id).toBe('openai-api')
    expect(dataSectionProvider(codex, DEFAULT_DATA_PROVIDERS, 'rag').ok).toBe(false)
  })

  it('модель пресета не замеряется, своя — замеряется на адресе провайдера памяти', () => {
    const preset = parseDataProviders('{"rag":{"provider":"gemini"}}')
    expect(embeddingProbeTarget(codex, preset)).toBeNull()
    const own = parseDataProviders(
      '{"rag":{"provider":"gemini"},"memory":{"provider":"custom","base_url":"http://lab/v1","key_env":"LAB_KEY","llm":"qwen","embedding":"e5"}}'
    )
    expect(embeddingProbeTarget(codex, own)).toEqual({
      baseUrl: 'http://lab/v1',
      keyEnvVar: 'LAB_KEY',
      model: 'e5'
    })
    expect(memoryEmbeddingModel(codex, own)).toBe('e5')
  })

  it('замеренная ширина живёт, пока не сменились модель и адрес; ширина из окна не принимается', () => {
    const saved = parseDataProviders(
      '{"memory":{"provider":"custom","base_url":"http://lab/v1","key_env":"LAB_KEY","llm":"qwen","embedding":"e5","embedding_dims":768}}'
    )
    expect(keepMeasuredWidth(gemini, saved, saved).memory.embeddingDims).toBe(768)
    const otherModel = parseDataProviders(
      '{"memory":{"provider":"custom","base_url":"http://lab/v1","key_env":"LAB_KEY","llm":"qwen","embedding":"bge","embedding_dims":768}}'
    )
    expect(keepMeasuredWidth(gemini, saved, otherModel).memory.embeddingDims).toBeUndefined()
    expect(embeddingProbeTarget(gemini, keepMeasuredWidth(gemini, saved, otherModel))?.model).toBe(
      'bge'
    )
  })

  it('смена эмбеддингов RAG при построенном индексе — предупреждение до сохранения', () => {
    const next = parseDataProviders('{"rag":{"provider":"openai-api"}}')
    const warnings = embeddingChangeWarnings({
      agent: gemini,
      saved: DEFAULT_DATA_PROVIDERS,
      next,
      index: { builtWith: 'gemini-embedding-2', projectModel: null }
    })
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('«gemini-embedding-2»')
    expect(warnings[0]).toContain('перестройку')
    expect(warnings[1]).toContain('Прежние факты не будут видны')
  })

  it('без индекса, с моделью проекта или без смены — предупреждений нет', () => {
    const next = parseDataProviders(
      '{"rag":{"provider":"openai-api"},"memory":{"provider":"gemini"}}'
    )
    expect(
      embeddingChangeWarnings({
        agent: gemini,
        saved: DEFAULT_DATA_PROVIDERS,
        next,
        index: noIndex
      })
    ).toEqual([])
    expect(
      embeddingChangeWarnings({
        agent: gemini,
        saved: DEFAULT_DATA_PROVIDERS,
        next,
        index: { builtWith: 'gemini-embedding-2', projectModel: 'gemini-embedding-2' }
      })
    ).toEqual([])
  })
})
