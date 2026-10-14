import { describe, expect, it } from 'vitest'

import { decodePreviewText, visibleDirEntries } from './preview-read-pure'

describe('visibleDirEntries (D-208, как их `fs-read-dir.ts`)', () => {
  const entry = (name: string, isDirectory: boolean) => ({ isDirectory, name, path: `/p/${name}` })

  it('сначала папки, внутри групп — по имени', () => {
    const out = visibleDirEntries([
      entry('б.md', false),
      entry('Расчётки', true),
      entry('а.md', false),
      entry('ИД', true)
    ])
    expect(out.map((item) => item.name)).toEqual(['ИД', 'Расчётки', 'а.md', 'б.md'])
  })

  it('шум не показывается — и папкой, и файлом с тем же именем', () => {
    const out = visibleDirEntries([
      entry('.git', true),
      entry('node_modules', true),
      entry('dist', false),
      entry('КР', true)
    ])
    expect(out.map((item) => item.name)).toEqual(['КР'])
  })
})

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
