import { describe, expect, it } from 'vitest'

import { documentTargetFromHref } from './document-link-pure'

// Задача T77 (UR55): маршрут ссылки агента — документ или нет.
describe('documentTargetFromHref', () => {
  it('md, PDF, Word, Excel, CSV и текст — документы', () => {
    expect(documentTargetFromHref('D:\\ЮП\\wiki\\ПЗ.md')).toBe('D:\\ЮП\\wiki\\ПЗ.md')
    expect(documentTargetFromHref('notes/план.pdf')).toBe('notes/план.pdf')
    expect(documentTargetFromHref('C:/p/записка.DOCX')).toBe('C:/p/записка.DOCX')
    expect(documentTargetFromHref('реестр.xlsx')).toBe('реестр.xlsx')
    expect(documentTargetFromHref('a.csv')).toBe('a.csv')
    expect(documentTargetFromHref('readme.txt')).toBe('readme.txt')
  })

  it('обёртки донора (#media:, #preview:) и file:// раскрываются', () => {
    expect(documentTargetFromHref('#media:' + encodeURIComponent('D:\\ЮП\\ПЗ.docx'))).toBe(
      'D:\\ЮП\\ПЗ.docx'
    )
    expect(documentTargetFromHref('#preview:' + encodeURIComponent('wiki/ТП-1.md'))).toBe(
      'wiki/ТП-1.md'
    )
    expect(documentTargetFromHref('file:///D:/%D0%AE%D0%9F/a.pdf')).toBe('D:\\ЮП\\a.pdf')
  })

  it('закодированное имя и якорь страницы', () => {
    expect(documentTargetFromHref('notes/%D0%BF%D0%BB%D0%B0%D0%BD.pdf#page=3')).toBe(
      'notes/план.pdf'
    )
  })

  it('веб, HTML, картинки и якоря — не документы', () => {
    expect(documentTargetFromHref('https://example.com/a.pdf')).toBeNull()
    expect(documentTargetFromHref('mailto:a@b.c')).toBeNull()
    expect(documentTargetFromHref('D:\\ЮП\\схема.png')).toBeNull()
    expect(documentTargetFromHref('report.html')).toBeNull()
    expect(documentTargetFromHref('#раздел')).toBeNull()
    expect(documentTargetFromHref('#preview:' + encodeURIComponent('D:\\ЮП\\a.html'))).toBeNull()
    expect(documentTargetFromHref(undefined)).toBeNull()
  })
})
