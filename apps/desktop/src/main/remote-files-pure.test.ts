// Задача 3.13b (SPEC UR20). Разбор ответа ядра и перевод его отказов на язык,
// на котором человеку понятно, что делать.

import { describe, expect, it } from 'vitest'

import {
  describeRemoteFileError,
  FILES_LIVE_ON_CORE_MACHINE,
  parseDataUrl,
  remoteBaseName
} from './remote-files-pure'

describe('разбор data-адреса', () => {
  it('достаёт тип и байты', () => {
    const parsed = parseDataUrl('data:text/plain;base64,0L/RgNC40LLQtdGC')

    expect(parsed?.mime).toBe('text/plain')
    expect(parsed?.bytes.toString('utf-8')).toBe('привет')
  })

  it('пустой файл — это пустые байты, а не отказ', () => {
    expect(parseDataUrl('data:text/plain;base64,')?.bytes.length).toBe(0)
  })

  it('всё, что не base64-адрес, — отказ, а не пустой документ', () => {
    expect(parseDataUrl('data:text/plain,привет'), 'иначе окно покажет пустоту').toBeNull()
    expect(parseDataUrl('https://example.org/a.png')).toBeNull()
    expect(parseDataUrl('')).toBeNull()
    expect(parseDataUrl(undefined)).toBeNull()
    expect(parseDataUrl(42)).toBeNull()
  })

  it('мусор вместо base64 не превращается в «файл из ничего»', () => {
    expect(parseDataUrl('data:image/png;base64,!!!!')).toBeNull()
  })
})

describe('отказ ядра — человеческими словами', () => {
  it.each([
    ['hermes REST 413: File too large', 'Файл слишком велик для просмотра'],
    ['hermes REST 403: File is not readable', 'Нет доступа к файлу'],
    ['Path points to a directory', 'Это папка, а не документ'],
    ['hermes REST 404: Not Found', 'Файл не найден на машине ядра']
  ])('%s', (message, expected) => {
    expect(describeRemoteFileError(new Error(message))).toBe(expected)
  })

  it('незнакомая причина не выдумывается, а показывается как есть', () => {
    const text = describeRemoteFileError(new Error('соединение сброшено'))

    expect(text).toContain('соединение сброшено')
    expect(text).toContain('машине ядра')
  })
})

describe('имя файла на чужой машине', () => {
  it('работает с обоими разделителями — своего мы не знаем', () => {
    expect(remoteBaseName('/srv/docs/смета.xlsx')).toBe('смета.xlsx')
    expect(remoteBaseName('C:\\docs\\смета.xlsx')).toBe('смета.xlsx')
    expect(remoteBaseName('файл.md')).toBe('файл.md')
  })
})

describe('одинаковая причина объясняется одинаково', () => {
  it('текст называет машину ядра, а не «ошибку доступа»', () => {
    expect(FILES_LIVE_ON_CORE_MACHINE).toContain('другой машине')
  })
})
