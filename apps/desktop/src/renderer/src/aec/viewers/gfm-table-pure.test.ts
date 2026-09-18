import { describe, expect, test } from 'vitest'

import { cellsOf, isBlankRow, isDelimiterRow, isTableRow } from './gfm-table-pure'

/** D-94: таблица, набранная разметкой. Здесь — только распознавание строк;
 *  сборка узла проверяется автоприёмкой (блок 20, шаг 6). */

describe('cellsOf', () => {
  test('внешние черты не считаются ячейками', () => {
    expect(cellsOf('| Позиция | Кол-во |')).toEqual(['Позиция', 'Кол-во'])
    expect(cellsOf('|---|---|')).toEqual(['---', '---'])
  })

  test('без внешних черт — тоже строка', () => {
    expect(cellsOf('а | б')).toEqual(['а', 'б'])
  })

  test('экранированная черта ячейку не делит', () => {
    expect(cellsOf('| а \\| б | в |')).toEqual(['а \\| б', 'в'])
  })
})

describe('isTableRow', () => {
  test('строка таблицы начинается с черты', () => {
    expect(isTableRow('| Автомат | 4 |')).toBe(true)
    expect(isTableRow('  | одна |')).toBe(true)
  })

  test('фраза с чертой внутри — не строка таблицы', () => {
    expect(isTableRow('вход | выход')).toBe(false)
    expect(isTableRow('|')).toBe(false)
    expect(isTableRow('обычный текст')).toBe(false)
  })
})

describe('isBlankRow', () => {
  test('пустые ячейки — и голые, и в записи сериализатора', () => {
    expect(isBlankRow('|  |  |')).toBe(true)
    expect(isBlankRow('| <br />  | <br /> |')).toBe(true)
  })

  test('ряд с текстом или разделитель — не пустой', () => {
    expect(isBlankRow('| Автомат | 4 |')).toBe(false)
    expect(isBlankRow('|---|---|')).toBe(false)
    expect(isBlankRow('обычный текст')).toBe(false)
  })
})

describe('isDelimiterRow', () => {
  test('дефисы, с выравниванием и без', () => {
    expect(isDelimiterRow('|---|---|')).toBe(true)
    expect(isDelimiterRow('| :-- | :-: | --: |')).toBe(true)
    expect(isDelimiterRow('---|---')).toBe(true)
  })

  test('без черты или с текстом — не разделитель', () => {
    expect(isDelimiterRow('---')).toBe(false)
    expect(isDelimiterRow('| а | б |')).toBe(false)
    expect(isDelimiterRow('|--x--|')).toBe(false)
  })
})
