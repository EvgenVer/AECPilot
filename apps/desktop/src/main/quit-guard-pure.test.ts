// Задача 3E.11. Проверяется то, что решает судьбу незаконченной работы: когда
// спрашиваем, когда молчим и что показываем. Сводку присылает окно, то есть
// перенесённый чужой код, — половина тестов про это.

import { describe, expect, it } from 'vitest'

import {
  mergeActiveWork,
  NO_ACTIVE_WORK,
  normalizeActiveWork,
  quitPromptFor
} from './quit-guard-pure'

describe('normalizeActiveWork', () => {
  it('обычная сводка проходит как есть', () => {
    expect(normalizeActiveWork({ count: 2, titles: ['Смета', 'Электрика'] })).toEqual({
      count: 2,
      titles: ['Смета', 'Электрика']
    })
  })

  it('не то и не так — это «работы нет», а не падение', () => {
    expect(normalizeActiveWork(undefined)).toEqual(NO_ACTIVE_WORK)
    expect(normalizeActiveWork('идёт')).toEqual(NO_ACTIVE_WORK)
    expect(normalizeActiveWork({ count: -3, titles: 'Смета' })).toEqual(NO_ACTIVE_WORK)
    expect(normalizeActiveWork({ count: 1.7, titles: [] }).count).toBe(1)
  })

  it('счёт не может быть меньше числа названных', () => {
    // Иначе окно с `{count: 0}` и непустым списком отменило бы вопрос о работе,
    // которая идёт.
    expect(normalizeActiveWork({ count: 0, titles: ['Смета'] })).toEqual({
      count: 1,
      titles: ['Смета']
    })
  })

  it('мусор внутри списка заголовков выбрасывается, а не показывается человеку', () => {
    expect(normalizeActiveWork({ count: 3, titles: ['  Смета  ', '', 42, null] })).toEqual({
      count: 3,
      titles: ['Смета']
    })
  })
})

describe('mergeActiveWork', () => {
  it('одна сессия в двух окнах считается один раз', () => {
    // Сумма сказала бы «работает в двух чатах» про один — то есть соврала бы о
    // размере потери ровно там, где человек решает, закрывать ли.
    const merged = mergeActiveWork([
      { count: 1, titles: ['Смета'] },
      { count: 1, titles: ['Смета'] }
    ])

    expect(merged).toEqual({ count: 1, titles: ['Смета'] })
  })

  it('разные окна с разной работой складываются по максимуму счёта', () => {
    expect(
      mergeActiveWork([
        { count: 2, titles: ['Смета'] },
        { count: 1, titles: ['ГИП'] }
      ])
    ).toEqual({ count: 2, titles: ['Смета', 'ГИП'] })
  })

  it('пусто — это пусто', () => {
    expect(mergeActiveWork([])).toEqual(NO_ACTIVE_WORK)
  })
})

describe('quitPromptFor', () => {
  it('работы нет — не спрашиваем', () => {
    expect(quitPromptFor(NO_ACTIVE_WORK)).toBeNull()
  })

  it('один чат назван в единственном числе', () => {
    expect(quitPromptFor({ count: 1, titles: ['Смета'] })?.message).toBe(
      'Агент ещё работает в одном чате.'
    )
  })

  it('длинный список сворачивается, а остаток назван числом', () => {
    const prompt = quitPromptFor({
      count: 7,
      titles: ['Смета', 'ГИП', 'Электрика', 'ОВ', 'ВК']
    })

    expect(prompt?.detail).toContain('• Смета')
    expect(prompt?.detail, 'пятый заголовок уже за пределом показа').not.toContain('• ВК')
    expect(prompt?.detail).toContain('• и ещё 3')
  })

  it('безымянные чаты не оставляют пустых строк списка', () => {
    const prompt = quitPromptFor({ count: 2, titles: [] })

    expect(prompt?.detail.startsWith('•'), 'списка нет — начинается объяснение').toBe(false)
    expect(prompt?.detail).toContain('пропадёт')
  })
})
