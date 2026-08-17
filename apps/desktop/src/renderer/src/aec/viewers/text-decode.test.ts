import { describe, expect, test } from 'vitest'

import { decodeText } from './text-decode'

/**
 * Задача 4.2. Проверяется ровно то, из-за чего текстовый просмотрщик выглядит
 * сломанным: русский файл в windows-1251, прочитанный как UTF-8.
 */

function bytes(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

/** «Кабель» в windows-1251: по одному байту на букву. */
const CP1251_КАБЕЛЬ = bytes(0xca, 0xe0, 0xe1, 0xe5, 0xeb, 0xfc)

describe('чем прочитан текст', () => {
  test('обычный UTF-8 читается как UTF-8', () => {
    const utf8 = new TextEncoder().encode('Кабель ВВГнг')

    expect(decodeText(utf8.buffer as ArrayBuffer)).toEqual({
      encoding: 'UTF-8',
      text: 'Кабель ВВГнг'
    })
  })

  test('windows-1251 не превращается в кракозябры', () => {
    // Главный тест файла: те же байты как UTF-8 дали бы «Êàáåëü».
    expect(decodeText(CP1251_КАБЕЛЬ)).toEqual({ encoding: 'windows-1251', text: 'Кабель' })
  })

  test('BOM UTF-8 снимается, а не попадает в текст', () => {
    const withBom = bytes(0xef, 0xbb, 0xbf, 0x41)

    // Иначе первая строка начинается с невидимого символа, и поиск по ней
    // промахивается на ровном месте.
    expect(decodeText(withBom)).toEqual({ encoding: 'UTF-8', text: 'A' })
  })

  test('UTF-16LE с BOM читается как UTF-16', () => {
    const withBom = bytes(0xff, 0xfe, 0x41, 0x00, 0x42, 0x00)

    expect(decodeText(withBom)).toEqual({ encoding: 'UTF-16LE', text: 'AB' })
  })

  test('пустой файл не считается ошибкой', () => {
    expect(decodeText(bytes())).toEqual({ encoding: 'UTF-8', text: '' })
  })

  test('латиница без национальных букв остаётся UTF-8', () => {
    // Однобайтовые кодировки совпадают с ASCII, и угадывать тут нечего —
    // важно, что не срабатывает ложный откат на кодовую страницу.
    expect(decodeText(bytes(0x48, 0x69))).toEqual({ encoding: 'UTF-8', text: 'Hi' })
  })
})
