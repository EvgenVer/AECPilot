// D-174 (решение владельца 2026-10-06): в окне выбора провайдера подписка
// ChatGPT идёт первой из входов по аккаунту, Nous Portal — последним, и
// выделенной «рекомендованной» строки донора больше нет.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FEATURED_ID } from '../../donor/components/onboarding'
import { sortProviders } from '../../donor/components/onboarding/providers'
import type { OAuthProvider } from '../../donor/types/hermes'

const provider = (id: string, name = id): OAuthProvider => ({ id, name }) as OAuthProvider

describe('порядок провайдеров в окне «Настроим для вас AECPilot»', () => {
  it('подписка ChatGPT первая, Nous Portal последний — даже после неизвестных', () => {
    const ids = sortProviders([
      provider('nous', 'Nous Portal'),
      provider('zeta-unknown'),
      provider('anthropic'),
      provider('openai-codex')
    ]).map((p) => p.id)
    expect(ids[0]).toBe('openai-codex')
    expect(ids.at(-1)).toBe('nous')
  })

  it('выделенного провайдера донора нет', () => {
    expect(FEATURED_ID).toBe('')
  })
})

// D-188 (решение владельца 2026-10-07): после ключа OpenAI их окно ищет провайдера
// ядра по надписи строки (`label.toLowerCase()`). Ядро зовёт его `openai-api`
// (замер `runtime/onboarding-models-probe.py`); без совпадения бралась первая
// строка (Nous, без моделей) и шаг выбора модели пропадал.
describe('строка ключа OpenAI в окне первого запуска', () => {
  it('надпись совпадает с именем провайдера в ядре', () => {
    const source = readFileSync(
      resolve(__dirname, '../../donor/components/onboarding/index.tsx'),
      'utf-8'
    )
    const row = /id: 'openai',[\s\S]*?name: '([^']+)',\s*envKey: 'OPENAI_API_KEY'/.exec(source)
    expect(row?.[1].toLowerCase()).toBe('openai-api')
  })
})
