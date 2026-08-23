// Подсказка `@имя` не предлагает того, с кем человек уже говорит (задача 3C.7).
//
// Правило само по себе проверено в `mentions-pure.test.ts`. Здесь проверяется
// то, что его ломает на деле: подсказке надо СКАЗАТЬ, кто активен, и однажды
// ей передавали пустую строку — правило было, а действия не было.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const activeSessionId = { value: '' }

vi.mock('../../donor/store/session', () => ({
  $activeSessionId: { get: () => activeSessionId.value }
}))

const registered: { data: { provide: (query: string) => { insert: string }[] } }[] = []

vi.mock('../../donor/contrib/registry', () => ({
  registry: {
    register: (contribution: never) => {
      registered.push(contribution)
      return () => {}
    }
  }
}))

vi.mock('../../donor/app/chat/composer/contrib', () => ({
  COMPOSER_AREAS: { atCompletions: 'composer.atCompletions' }
}))

const { registerMentionCompletions, setMentionRoster } = await import('./register-mentions')

const ROSTER = [
  { handle: 'smeta', title: 'Смета', role: 'сметчик', device: '' },
  { handle: 'elektrika', title: 'Электрика', role: 'электрик', device: '' }
]

function offered(query = ''): string[] {
  return registered[0].data.provide(query).map((item) => item.insert)
}

describe('подсказка @имя', () => {
  beforeEach(() => {
    registered.length = 0
    activeSessionId.value = ''
    registerMentionCompletions()
  })

  it('в обычной сессии предлагает всех — себя там нет', () => {
    setMentionRoster(ROSTER, { 'с-смета': 'smeta' })

    expect(offered()).toEqual(['@Смета', '@Электрика'])
  })

  it('в постоянном чате специалиста не предлагает его самого', () => {
    setMentionRoster(ROSTER, { 'с-смета': 'smeta', 'с-электрика': 'elektrika' })
    activeSessionId.value = 'с-смета'

    expect(offered()).toEqual(['@Электрика'])
  })

  it('чужой открытый чат ничего не убирает', () => {
    setMentionRoster(ROSTER, { 'с-смета': 'smeta' })
    activeSessionId.value = 'какая-то-другая-сессия'

    expect(offered()).toEqual(['@Смета', '@Электрика'])
  })

  it('без привязок работает как раньше', () => {
    setMentionRoster(ROSTER)

    expect(offered()).toEqual(['@Смета', '@Электрика'])
  })
})
