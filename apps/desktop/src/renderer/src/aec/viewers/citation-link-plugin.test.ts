import { describe, expect, test } from 'vitest'

import { citationFromLink } from './citation-link-plugin'

/** Чек-лист 22.1.4: ссылка `[src: …](#cite)` на странице вики открывает
 *  документ. Здесь — решение «это ссылка на источник или нет»; сам переход —
 *  тот же `openDocument`, что у фишки в ответе агента. */

describe('ссылка на источник в редакторе', () => {
  test('текст ссылки `src: …` и адрес #cite — цитата с файлом и местом', () => {
    const citation = citationFromLink('#cite', 'src: 6c746b66/отчёт.pdf#p7')
    expect(citation).toMatchObject({
      relPath: 'отчёт.pdf',
      sourceId: '6c746b66',
      locator: { page: 7 }
    })
  })

  test('ссылка без места — цитата на файл целиком', () => {
    expect(citationFromLink('#cite', 'src: s1/ТЗ на электроснабжение.docx')).toMatchObject({
      relPath: 'ТЗ на электроснабжение.docx',
      sourceId: 's1'
    })
  })

  test('обычная ссылка наружу — не цитата, клик достаётся редактору', () => {
    expect(citationFromLink('https://example.com', 'src: s1/a.pdf')).toBeNull()
    expect(citationFromLink(undefined, 'src: s1/a.pdf')).toBeNull()
  })

  test('#cite с посторонним текстом — не цитата', () => {
    expect(citationFromLink('#cite', 'см. документ')).toBeNull()
  })
})
