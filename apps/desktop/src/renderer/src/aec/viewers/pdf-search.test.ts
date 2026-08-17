import { describe, expect, test } from 'vitest'

import { findMatches, matchNearPage, normalizeQuery, toSearchable } from './pdf-search'
import type { TextPiece } from './pdf-search'

/**
 * Задача 4.1. Здесь проверяется ровно то, из-за чего наивный поиск по PDF не
 * работает: слово разорвано на куски, перенос строки — не символ, а регистр и
 * пробелы в исходнике произвольны.
 */

function piece(text: string, eol = false, box: Partial<TextPiece> = {}): TextPiece {
  return { text, eol, x: 0, y: 0, width: 10, height: 10, ...box }
}

describe('нормализация запроса', () => {
  test('регистр и лишние пробелы не влияют', () => {
    expect(normalizeQuery('  Кабель   ВВГнг  ')).toBe('кабель ввгнг')
  })
})

describe('склейка страницы', () => {
  test('слово, разорванное на куски, ищется целиком', () => {
    // Ровно так pdf.js и отдаёт кернингованный текст.
    const page = toSearchable(1, [piece('Тран'), piece('сфор'), piece('матор')])

    expect(page.text).toBe('трансформатор')
    expect(findMatches([page], 'трансформатор')).toEqual([{ page: 1, pieces: [0, 1, 2] }])
  })

  test('на границе строк появляется пробел', () => {
    const page = toSearchable(1, [piece('мощность', true), piece('трансформатора')])

    // Без этого получилось бы «мощностьтрансформатора» — и запрос из двух слов
    // не нашёлся бы никогда.
    expect(page.text).toBe('мощность трансформатора')
    expect(findMatches([page], 'мощность трансформатора')).toHaveLength(1)
  })

  test('пробельные последовательности сжимаются, карта не разъезжается', () => {
    const page = toSearchable(1, [piece('  А   Б  ')])

    expect(page.text).toBe('а б')
    expect(page.owner).toHaveLength(page.text.length)
  })
})

describe('поиск', () => {
  const pages = [
    toSearchable(1, [piece('Кабель ВВГнг проложен', true), piece('в лотке')]),
    toSearchable(2, [piece('Кабель ВВГнг заведён в щит; кабель заменён')])
  ]

  test('находит все вхождения на всех страницах', () => {
    expect(findMatches(pages, 'кабель')).toEqual([
      { page: 1, pieces: [0] },
      { page: 2, pieces: [0] },
      { page: 2, pieces: [0] }
    ])
  })

  test('запрос короче двух символов не ищется', () => {
    // Иначе «в» подсветит весь документ и поиск станет бесполезен.
    expect(findMatches(pages, 'в')).toEqual([])
    expect(findMatches(pages, '')).toEqual([])
  })

  test('совпадение через границу кусков собирает оба куска', () => {
    expect(findMatches(pages, 'проложен в лотке')).toEqual([{ page: 1, pieces: [0, 1] }])
  })

  test('чего нет — того нет', () => {
    expect(findMatches(pages, 'алюминиевый')).toEqual([])
  })
})

describe('выбор совпадения после ввода запроса', () => {
  const matches = [
    { page: 1, pieces: [0] },
    { page: 5, pieces: [0] },
    { page: 9, pieces: [0] }
  ]

  test('берётся первое на текущей странице или после неё', () => {
    expect(matchNearPage(matches, 5)).toBe(1)
    expect(matchNearPage(matches, 6)).toBe(2)
  })

  test('если впереди ничего нет — с начала', () => {
    expect(matchNearPage(matches, 40)).toBe(0)
    expect(matchNearPage([], 3)).toBe(0)
  })
})
