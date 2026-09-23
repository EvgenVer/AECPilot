import { describe, expect, it } from 'vitest'

import { decodePreviewText } from './preview-read-pure'

const bytes = (text: string) => new TextEncoder().encode(text)

describe('decodePreviewText', () => {
  it('текст файла целиком — как есть, без признаков', () => {
    const head = bytes('# Заметка\nвторая строка\n')
    expect(decodePreviewText(head, head.byteLength)).toEqual({
      binary: false,
      byteSize: head.byteLength,
      text: '# Заметка\nвторая строка\n',
      truncated: false
    })
  })

  it('прочитано только начало — `truncated`, чтобы редактор не сохранил обрезок', () => {
    const head = bytes('начало')
    expect(decodePreviewText(head, head.byteLength + 100).truncated).toBe(true)
  })

  it('нулевой байт — двоичный файл, текст не отдаётся', () => {
    const out = decodePreviewText(new Uint8Array([0x50, 0x4b, 0x00, 0x03]), 4)
    expect(out.binary).toBe(true)
    expect(out.text).toBe('')
  })
})
