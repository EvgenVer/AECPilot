import { describe, expect, test } from 'vitest'

import {
  markProvidersWithoutKey,
  providerBeingSaved,
  providersWithoutKey
} from './model-keys-pure'

const ENV = {
  GEMINI_API_KEY: { provider: 'gemini', is_password: true, is_set: true },
  GEMINI_BASE_URL: { provider: 'gemini', is_password: false, is_set: false },
  OPENROUTER_API_KEY: { provider: 'openrouter', is_password: true, is_set: false },
  // Два поля у одного провайдера: достаточно одного заданного.
  ZAI_API_KEY: { provider: 'zai', is_password: true, is_set: false },
  GLM_API_KEY: { provider: 'zai', is_password: true, is_set: true },
  // Вход не ключом (Vertex, AWS) — поле не пароль.
  VERTEX_CREDENTIALS: { provider: 'vertex', is_password: false, is_set: false },
  // Локальные — никогда.
  LM_API_KEY: { provider: 'lmstudio', is_password: true, is_set: false },
  OLLAMA_API_KEY: { provider: 'ollama', is_password: true, is_set: false },
  TAVILY_API_KEY: { is_password: true, is_set: false }
}

describe('провайдеры без ключа (D-109)', () => {
  test('помечается только тот, у кого поле-пароль есть и не задано', () => {
    expect([...providersWithoutKey(ENV)]).toEqual(['openrouter'])
  })

  test('ключ в нашем хранилище (не в .env) — тоже ключ', () => {
    expect([...providersWithoutKey(ENV, new Set(['OPENROUTER_API_KEY']))]).toEqual([])
  })

  test('OAuth-провайдер без строк в каталоге не помечается', () => {
    expect(providersWithoutKey(ENV).has('nous')).toBe(false)
  })

  test('в видимом имени — «нет ключа», slug тот же', () => {
    const options = {
      model: 'x',
      providers: [
        { slug: 'gemini', name: 'Google Gemini', models: ['g'] },
        { slug: 'openrouter', name: 'OpenRouter', models: ['o'] },
        { slug: 'nous' }
      ]
    }
    const marked = markProvidersWithoutKey(options, new Set(['openrouter', 'nous']))
    expect(marked.providers.map((p) => p.name)).toEqual([
      'Google Gemini',
      'OpenRouter — нет ключа',
      'nous — нет ключа'
    ])
    expect(marked.providers[1].slug).toBe('openrouter')
    expect(marked.model).toBe('x')
    expect(options.providers[1].name).toBe('OpenRouter')
  })

  test('сохраняемый провайдер — только у записи профиля', () => {
    expect(providerBeingSaved('profiles.configure', { name: 'a', provider: ' openrouter ' })).toBe(
      'openrouter'
    )
    expect(providerBeingSaved('profiles.create', { name: 'a', provider: 'gemini' })).toBe('gemini')
    expect(providerBeingSaved('profiles.configure', { name: 'a', soul: 'x' })).toBeNull()
    expect(providerBeingSaved('model.switch', { provider: 'openrouter' })).toBeNull()
  })
})
