// D-174 (решение владельца 2026-10-06): в окне выбора провайдера подписка
// ChatGPT идёт первой из входов по аккаунту, Nous Portal — последним, и
// выделенной «рекомендованной» строки донора больше нет.
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
