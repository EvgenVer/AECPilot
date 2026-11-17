// Задача T75: ссылки и картинки md — правила разбора.

import { describe, expect, it } from 'vitest'

import {
  imageMime,
  isEmbedAt,
  isExternalHref,
  isImageName,
  linkFileName,
  resolveVaultLink
} from './vault-link-pure'

describe('linkFileName — [[цель]]', () => {
  it('страница без расширения — .md', () => {
    expect(linkFileName('Кабельный журнал')).toBe('Кабельный журнал.md')
  })

  it('[[файл.pdf]] и [[файл.docx]] — файл как есть', () => {
    expect(linkFileName('ТУ на подключение.pdf')).toBe('ТУ на подключение.pdf')
    expect(linkFileName('записка.DOCX')).toBe('записка.DOCX')
    expect(linkFileName('ведомость.xlsx')).toBe('ведомость.xlsx')
  })

  it('картинка — как есть', () => {
    expect(linkFileName('схема.png')).toBe('схема.png')
  })

  it('неизвестное расширение — это часть имени страницы', () => {
    expect(linkFileName('ТП-1.1')).toBe('ТП-1.1.md')
  })

  it('подпапка отбрасывается, запрещённые символы — отказ', () => {
    expect(linkFileName('tasks/ЭОМ/задание.pdf')).toBe('задание.pdf')
    expect(linkFileName('a?b')).toBeNull()
  })
})

describe('resolveVaultLink — [текст](путь)', () => {
  it('от папки md-файла', () => {
    expect(resolveVaultLink('wiki/entities/ТП-1.md', '../sources/ТУ.pdf')).toBe(
      'wiki/sources/ТУ.pdf'
    )
    expect(resolveVaultLink('wiki/index.md', 'ТП-1.md')).toBe('wiki/ТП-1.md')
  })

  it('/… — от корня vault', () => {
    expect(resolveVaultLink('wiki/index.md', '/workspace/notes/x.docx')).toBe(
      'workspace/notes/x.docx'
    )
  })

  it('%20, якорь и запрос', () => {
    expect(resolveVaultLink('index.md', 'Кабельный%20журнал.md#раздел')).toBe('Кабельный журнал.md')
    expect(resolveVaultLink('index.md', 'a.pdf?page=3')).toBe('a.pdf')
  })

  it('обратные слэши Windows', () => {
    expect(resolveVaultLink('index.md', 'workspace\\x.md')).toBe('workspace/x.md')
  })

  it('выход за корень, диск, сеть и цитата — не файл vault', () => {
    expect(resolveVaultLink('index.md', '../секрет.txt')).toBeNull()
    expect(resolveVaultLink('index.md', 'C:/Windows/win.ini')).toBeNull()
    expect(resolveVaultLink('index.md', 'https://example.com/a.pdf')).toBeNull()
    expect(resolveVaultLink('index.md', '#cite')).toBeNull()
    expect(resolveVaultLink('index.md', 'file:///C:/x')).toBeNull()
  })
})

describe('картинки и внешние ссылки', () => {
  it('isImageName и mime', () => {
    expect(isImageName('схема.PNG')).toBe(true)
    expect(isImageName('записка.docx')).toBe(false)
    expect(imageMime('a.jpg')).toBe('image/jpeg')
    expect(imageMime('a.svg')).toBe('image/svg+xml')
  })

  it('внешняя ссылка', () => {
    expect(isExternalHref('https://example.com')).toBe(true)
    expect(isExternalHref('mailto:a@b.c')).toBe(true)
    expect(isExternalHref('wiki/a.md')).toBe(false)
  })

  it('![[…]] — вставка, [[…]] — ссылка', () => {
    const text = 'см. ![[схема.png]] и [[ТП-1]]'
    expect(isEmbedAt(text, text.indexOf('[[схема'))).toBe(true)
    expect(isEmbedAt(text, text.indexOf('[[ТП-1'))).toBe(false)
  })
})
