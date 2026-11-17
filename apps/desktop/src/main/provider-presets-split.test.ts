// Task T80 (UR53, decision 0021): «Индекс и память» chooses the embeddings and
// the extraction model separately, and a custom address needs no key (Ollama,
// LM Studio).

import { describe, expect, it } from 'vitest'

import {
  dataKeyEnvVars,
  embeddingChangeWarnings,
  parseDataProviders,
  PROVIDER_PRESETS,
  ragProvider,
  resolveProvider,
  serializeDataProviders
} from './provider-presets-pure'

const gemini = { provider: 'gemini' }
const codex = { provider: 'openai-codex' }

describe('a custom address without a key (T80)', () => {
  it('resolves, with an empty key variable', () => {
    expect(resolveProvider({ provider: 'custom', baseUrl: 'http://127.0.0.1:11434/v1' })).toEqual({
      ok: true,
      id: 'custom',
      baseUrl: 'http://127.0.0.1:11434/v1',
      keyEnvVar: '',
      models: null
    })
  })

  it('an address is still required', () => {
    expect(resolveProvider({ provider: 'custom', keyEnvVar: 'X_API_KEY' })).toMatchObject({
      ok: false
    })
  })

  it('builds the index env with no key variable', () => {
    const choice = parseDataProviders(
      JSON.stringify({
        rag: {
          provider: 'custom',
          base_url: 'http://127.0.0.1:11434/v1',
          embedding: 'bge-m3',
          extraction: 'qwen3:8b'
        }
      })
    )
    expect(ragProvider(codex, choice)).toEqual({
      ok: true,
      env: {
        AEC_RAG_BASE_URL: 'http://127.0.0.1:11434/v1',
        AEC_RAG_KEY_ENV: '',
        AEC_RAG_EMBEDDING_MODEL: 'bge-m3',
        AEC_RAG_EXTRACTION_MODEL: 'qwen3:8b'
      }
    })
    expect(dataKeyEnvVars(choice)).toEqual([])
  })
})

describe('extraction from another provider (T80)', () => {
  const split = parseDataProviders(
    JSON.stringify({
      rag: {
        provider: 'custom',
        base_url: 'http://127.0.0.1:11434/v1',
        embedding: 'bge-m3',
        extraction_provider: 'gemini'
      }
    })
  )

  it('is read from the file', () => {
    expect(split.rag.extractionProvider).toBe('gemini')
  })

  it('gives aec-rag a second address and key variable for extraction', () => {
    expect(ragProvider(codex, split)).toEqual({
      ok: true,
      env: {
        AEC_RAG_BASE_URL: 'http://127.0.0.1:11434/v1',
        AEC_RAG_KEY_ENV: '',
        AEC_RAG_EMBEDDING_MODEL: 'bge-m3',
        AEC_RAG_EXTRACTION_BASE_URL: PROVIDER_PRESETS.gemini.baseUrl,
        AEC_RAG_EXTRACTION_KEY_ENV: 'GEMINI_API_KEY',
        AEC_RAG_EXTRACTION_MODEL: PROVIDER_PRESETS.gemini.models?.agent
      }
    })
  })

  it('needs the extraction provider key variable, not the embeddings one', () => {
    expect(dataKeyEnvVars(split)).toEqual(['GEMINI_API_KEY'])
  })

  it('round-trips through the file', () => {
    expect(parseDataProviders(JSON.stringify(serializeDataProviders(split)))).toEqual(split)
  })

  it('a keyless local extraction server with its own address', () => {
    const local = parseDataProviders(
      JSON.stringify({
        rag: {
          provider: 'gemini',
          extraction_provider: 'custom',
          extraction_base_url: 'http://127.0.0.1:1234/v1',
          extraction: 'qwen3:8b'
        }
      })
    )
    const resolved = ragProvider(gemini, local)
    expect(resolved.ok && resolved.env).toMatchObject({
      AEC_RAG_KEY_ENV: 'GEMINI_API_KEY',
      AEC_RAG_EXTRACTION_BASE_URL: 'http://127.0.0.1:1234/v1',
      AEC_RAG_EXTRACTION_KEY_ENV: '',
      AEC_RAG_EXTRACTION_MODEL: 'qwen3:8b'
    })
  })

  it('«as the agent» for extraction with a subscription agent is refused in words', () => {
    const asAgent = parseDataProviders(
      JSON.stringify({ rag: { provider: 'gemini', extraction_provider: 'agent' } })
    )
    const resolved = ragProvider(codex, asAgent)
    expect(resolved.ok).toBe(false)
    if (!resolved.ok) expect(resolved.reason).toContain('openai-codex')
  })

  it('changing only the extraction provider does not warn about rebuilding the index', () => {
    const saved = parseDataProviders('{"rag":{"provider":"gemini"}}')
    const next = parseDataProviders(
      '{"rag":{"provider":"gemini","extraction_provider":"openai-api"}}'
    )
    expect(
      embeddingChangeWarnings({
        agent: gemini,
        saved,
        next,
        index: { builtWith: 'gemini-embedding-2', projectModel: null }
      })
    ).toEqual([])
  })
})
