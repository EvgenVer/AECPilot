// Задача 5.14. Правило языка — одна строка, и весь её вес в трёх решениях,
// которые из самой строки не видны. Тесты держат именно их.

import { describe, expect, it } from 'vitest'

import { soulLanguageRule } from './soul-language'

describe('soulLanguageRule', () => {
  it('пишет правило на том языке, о котором оно говорит', () => {
    // Инструкция «отвечай по-русски», написанная по-английски, работает хуже —
    // поэтому правило и его язык совпадают, а не переводятся друг через друга.
    expect(soulLanguageRule('ru')).toContain('по-русски')
    expect(soulLanguageRule('en')).toContain('in English')
  })

  it('на незнакомой локали молчит, а не подставляет английский', () => {
    // Запасной английский здесь означал бы решить за человека, выбравшего
    // японский. Пустая строка честнее: поле остаётся пустым и видно, что
    // выбирать ему.
    expect(soulLanguageRule('ja')).toBe('')
    expect(soulLanguageRule('zh')).toBe('')
  })

  it('не приносит с собой ни персоны, ни правил работы', () => {
    // Граница waiver владельца (AGENTS §9): без эвала разрешена СТРОКА ПРО
    // ЯЗЫК. Персона, тон и правила работы — другое изменение промпта, и оно
    // потребовало бы либо эвала, либо своего waiver.
    for (const locale of ['ru', 'en'] as const) {
      expect(soulLanguageRule(locale).split('\n')).toHaveLength(1)
      expect(soulLanguageRule(locale).length).toBeLessThan(120)
    }
  })
})
