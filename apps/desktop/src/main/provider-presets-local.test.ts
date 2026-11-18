// Task T83 (UR53): «Локальная модель» — embeddings from the app's own llama.cpp
// server, extraction (and memory) from a provider that can write text.

import { describe, expect, it } from 'vitest'

import {
  dataKeyEnvVars,
  dataSectionProvider,
  embeddingChangeWarnings,
  memoryProvider,
  parseDataProviders,
  ragProvider,
  serializeDataProviders
} from './provider-presets-pure'

const gemini = { provider: 'gemini' }
const local = { baseUrl: 'http://127.0.0.1:47821/v1', model: 'bge-m3' }

const localChoice = (extra: Record<string, unknown> = {}): ReturnType<typeof parseDataProviders> =>
  parseDataProviders(JSON.stringify({ rag: { provider: 'local', ...extra } }))

describe('local embeddings in the provider choice (T83)', () => {
  it('survives the file round trip', () => {
    const choice = localChoice({ extraction_provider: 'gemini' })
    expect(choice.rag.provider).toBe('local')
    expect(serializeDataProviders(choice).rag).toEqual({
      provider: 'local',
      extraction_provider: 'gemini'
    })
  })

  it('builds the index env: local vectors with no key, extraction from its own provider', () => {
    const answer = ragProvider(gemini, localChoice({ extraction_provider: 'agent' }), local)
    expect(answer).toEqual({
      ok: true,
      env: {
        AEC_RAG_BASE_URL: 'http://127.0.0.1:47821/v1',
        AEC_RAG_KEY_ENV: '',
        AEC_RAG_EMBEDDING_MODEL: 'bge-m3',
        AEC_RAG_EXTRACTION_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        AEC_RAG_EXTRACTION_KEY_ENV: 'GEMINI_API_KEY',
        AEC_RAG_EXTRACTION_MODEL: expect.any(String)
      }
    })
  })

  it('refuses in words while no model is downloaded, and never falls back to a cloud embedder', () => {
    const answer = ragProvider(gemini, localChoice({ extraction_provider: 'agent' }), null)
    expect(answer.ok).toBe(false)
    expect(answer.ok ? '' : answer.reason).toMatch(/Скачать|Download/)
  })

  it('asks for an extraction provider: the embedding server cannot write text', () => {
    const answer = ragProvider(gemini, localChoice(), local)
    expect(answer.ok).toBe(false)
    expect(answer.ok ? '' : answer.reason).toMatch(/разбора|extraction/)
  })

  it('memory «as RAG» follows the extraction provider, not the embedding server', () => {
    const resolved = dataSectionProvider(
      gemini,
      localChoice({ extraction_provider: 'agent' }),
      'memory'
    )
    expect(resolved).toMatchObject({ ok: true, id: 'gemini' })
    expect(memoryProvider(gemini, localChoice({ extraction_provider: 'agent' }))).toMatchObject({
      ok: true
    })
  })

  it('needs no key variable of its own', () => {
    expect(dataKeyEnvVars(localChoice({ extraction_provider: 'agent' }))).toEqual([])
    expect(dataKeyEnvVars(localChoice({ extraction_provider: 'gemini' }))).toEqual([
      'GEMINI_API_KEY'
    ])
  })

  it('warns before the save that the index will be rebuilt with the local model', () => {
    const warnings = embeddingChangeWarnings({
      agent: gemini,
      saved: parseDataProviders(null),
      next: localChoice({ extraction_provider: 'agent' }),
      index: { builtWith: 'gemini-embedding-2', projectModel: null },
      local
    })
    expect(warnings.some((line) => line.includes('bge-m3'))).toBe(true)
  })

  it('has no model list to load: the one model is the downloaded file', () => {
    expect(dataSectionProvider(gemini, localChoice(), 'rag').ok).toBe(false)
  })
})
