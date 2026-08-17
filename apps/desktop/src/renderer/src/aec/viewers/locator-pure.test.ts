import { describe, expect, test } from 'vitest'

import { columnNumber, findSheet, headingMatches, isCited, parseA1Range } from './locator-pure'

/** Задача 4.4. Ссылка обещает место, а не файл. Здесь проверяется перевод
 *  обещания в координаты — и отказ, когда перевести нечего. */

describe('номер столбца', () => {
  test('после Z идёт AA, а не BA', () => {
    expect(columnNumber('A')).toBe(1)
    expect(columnNumber('Z')).toBe(26)
    expect(columnNumber('AA')).toBe(27)
    expect(columnNumber('AZ')).toBe(52)
    expect(columnNumber('BA')).toBe(53)
  })

  test('регистр не важен', () => {
    expect(columnNumber('c')).toBe(3)
  })
})

describe('разбор диапазона', () => {
  test('одна ячейка — диапазон из себя одной', () => {
    expect(parseA1Range('C5')).toEqual({ bottom: 5, left: 3, right: 3, top: 5 })
  })

  test('диапазон из спеки', () => {
    expect(parseA1Range('C5:D6')).toEqual({ bottom: 6, left: 3, right: 4, top: 5 })
  })

  test('углы, записанные наоборот, всё равно дают тот же прямоугольник', () => {
    expect(parseA1Range('D6:C5')).toEqual(parseA1Range('C5:D6'))
  })

  test('чепуха — это null, а не первая ячейка', () => {
    // Соврать про место хуже, чем открыть файл целиком.
    for (const bad of ['', 'Ведомость', '5C', 'A1:B2:C3', 'A0', '#REF!']) {
      expect(parseA1Range(bad), bad).toBeNull()
    }
  })
})

describe('попадание ячейки в диапазон', () => {
  const range = parseA1Range('C5:D6')

  test('углы диапазона входят в него', () => {
    // Индексы с нуля: C5 это строка 4, столбец 2.
    expect(isCited(4, 2, range)).toBe(true)
    expect(isCited(5, 3, range)).toBe(true)
  })

  test('соседи снаружи не подсвечиваются', () => {
    expect(isCited(3, 2, range)).toBe(false)
    expect(isCited(4, 1, range)).toBe(false)
    expect(isCited(6, 2, range)).toBe(false)
    expect(isCited(4, 4, range)).toBe(false)
  })

  test('без диапазона не подсвечивается ничего', () => {
    expect(isCited(0, 0, null)).toBe(false)
  })
})

describe('поиск листа', () => {
  const names = ['Титул', 'Ведомость', 'ЭОМ']

  test('точное имя', () => {
    expect(findSheet(names, 'Ведомость')).toBe(1)
  })

  test('регистр и краевые пробелы прощаются', () => {
    // Имя листа переносит в цитату модель, и такая вольность — обычное дело.
    expect(findSheet(names, ' ведомость ')).toBe(1)
  })

  test('нет такого листа — null, а не первый', () => {
    expect(findSheet(names, 'Кабельный журнал')).toBeNull()
    expect(findSheet(names, undefined)).toBeNull()
  })
})

describe('поиск заголовка', () => {
  test('совпадение по префиксу — цитата обрезает длинный заголовок', () => {
    expect(headingMatches('Кабельный журнал (лист 2)', 'Кабельный журнал')).toBe(true)
  })

  test('лишние пробелы и регистр не мешают', () => {
    expect(headingMatches('  КАБЕЛЬНЫЙ   ЖУРНАЛ ', 'кабельный журнал')).toBe(true)
  })

  test('середина строки не считается', () => {
    // Иначе прокрутка встала бы на первый абзац, где слово просто упомянуто.
    expect(headingMatches('см. Кабельный журнал', 'Кабельный журнал')).toBe(false)
  })

  test('пустой заголовок не совпадает ни с чем', () => {
    expect(headingMatches('что угодно', '   ')).toBe(false)
  })
})
