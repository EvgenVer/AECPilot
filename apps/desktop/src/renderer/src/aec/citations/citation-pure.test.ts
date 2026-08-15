// Tests for the citation grammar on the renderer side (task 2.13).
//
// The examples are the ones written down in specs/qa-over-sources.md §Формат
// locator, so this file and mcp/aec_rag/tests/test_citation.py assert the same
// contract from opposite sides of the wire — that agreement is the only thing
// keeping two implementations of one grammar honest.

import { describe, expect, it } from 'vitest'

import {
  CITATION_HREF,
  citationLabel,
  formatCitation,
  formatLocator,
  isCitationHref,
  parseCitationLabel,
  parseCitations,
  parseLocator
} from './citation-pure'

describe('formatLocator', () => {
  it('writes each format in its own notation', () => {
    expect(formatLocator({ page: 12 })).toBe('p12')
    expect(formatLocator({ range: 'C5:D6', sheet: 'Ведомость' })).toBe('Ведомость!C5:D6')
    expect(formatLocator({ heading: 'Кабельный журнал' })).toBe('h:Кабельный журнал')
  })

  it('names a sheet without a range when the range is unknown', () => {
    expect(formatLocator({ sheet: 'Ведомость' })).toBe('Ведомость')
  })

  it('prefers the page when a chunk carries both — a viewer can open a page', () => {
    expect(formatLocator({ heading: 'Кабельный журнал', page: 7 })).toBe('p7')
  })

  it('has nothing to say about a place that cannot be named', () => {
    expect(formatLocator({})).toBeNull()
    expect(formatLocator(undefined)).toBeNull()
  })

  it('cuts a heading at the first character a citation cannot carry', () => {
    // Truncation, not escaping: the viewer matches by prefix, so a cut anchor
    // still lands in the right section — an escaped one would match nothing.
    expect(formatLocator({ heading: 'Раздел ] хвост' })).toBe('h:Раздел')
    expect(formatLocator({ heading: 'Раздел # хвост' })).toBe('h:Раздел')
    expect(formatLocator({ heading: 'Раздел\nвторая строка' })).toBe('h:Раздел')
  })

  it('says nothing rather than `h:` when a heading is only punctuation', () => {
    expect(formatLocator({ heading: '#' })).toBeNull()
  })
})

describe('parseLocator', () => {
  it('round-trips every form', () => {
    expect(parseLocator('p12')).toEqual({ page: 12 })
    expect(parseLocator('Ведомость!C5:D6')).toEqual({ range: 'C5:D6', sheet: 'Ведомость' })
    expect(parseLocator('h:Кабельный журнал')).toEqual({ heading: 'Кабельный журнал' })
    expect(parseLocator('Ведомость')).toEqual({ sheet: 'Ведомость' })
  })

  it('reads an empty or unreadable locator as «place unknown», not as an error', () => {
    expect(parseLocator('')).toEqual({})
    expect(parseLocator('   ')).toEqual({})
    expect(parseLocator('h:')).toEqual({})
  })
})

describe('parseCitations', () => {
  it('finds a citation and says where it sits in the text', () => {
    const text = 'Мощность 250 кВт [src: tasks/ЭОМ/задание.pdf#p12] по заданию.'

    const [citation] = parseCitations(text)

    expect(citation.sourceId).toBe('tasks')
    expect(citation.relPath).toBe('ЭОМ/задание.pdf')
    expect(citation.locator).toEqual({ page: 12 })
    expect(text.slice(citation.start, citation.end)).toBe(citation.raw)
  })

  it('finds every citation in an answer, in order', () => {
    const text =
      'По ред. 2 — 250 кВт [src: tasks/задание_ред2.pdf#p12], по ред. 1 — 180 кВт [src: tasks/задание.pdf#p11].'

    expect(parseCitations(text).map((c) => c.relPath)).toEqual([
      'задание_ред2.pdf',
      'задание.pdf'
    ])
  })

  it('reads a spreadsheet and a heading citation', () => {
    const text = '[src: tasks/Ведомости/кабели.xlsx#Ведомость!C5:D6] и [src: tasks/ПЗ.docx#h:Кабельный журнал]'

    expect(parseCitations(text).map((c) => c.locator)).toEqual([
      { range: 'C5:D6', sheet: 'Ведомость' },
      { heading: 'Кабельный журнал' }
    ])
  })

  it('accepts a citation with no locator — the file is still worth opening', () => {
    const [citation] = parseCitations('[src: tasks/данные.csv]')

    expect(citation.relPath).toBe('данные.csv')
    expect(citation.locator).toEqual({})
  })

  it('skips a broken citation without losing the good ones beside it', () => {
    // This runs over model output. One missing bracket must not cost the reader
    // the other references in the same answer.
    const text = 'сначала [src: tasks/битая#p1 потом [src: tasks/целая.pdf#p3] конец'

    expect(parseCitations(text).map((c) => c.relPath)).toEqual(['целая.pdf'])
  })

  it('ignores a citation with no path at all', () => {
    expect(parseCitations('[src: tasks/]')).toEqual([])
    expect(parseCitations('[src: ]')).toEqual([])
  })

  it('ignores ordinary bracketed text', () => {
    expect(parseCitations('см. [1] и [примечание]')).toEqual([])
  })

  it('is not confused by two runs over the same text', () => {
    const text = '[src: tasks/а.pdf#p1] и [src: tasks/б.pdf#p2]'

    expect(parseCitations(text)).toHaveLength(2)
    expect(parseCitations(text)).toHaveLength(2)
  })

  it('survives empty and blank input', () => {
    expect(parseCitations('')).toEqual([])
    expect(parseCitations('   ')).toEqual([])
  })
})

describe('formatCitation', () => {
  it('is the inverse of parsing', () => {
    const written = formatCitation('tasks', 'ЭОМ/задание.pdf', { page: 12 })

    expect(written).toBe('[src: tasks/ЭОМ/задание.pdf#p12]')
    expect(parseCitations(written)[0].relPath).toBe('ЭОМ/задание.pdf')
  })

  it('omits the locator part when there is no place to name', () => {
    expect(formatCitation('tasks', 'данные.csv')).toBe('[src: tasks/данные.csv]')
  })
})

describe('parseCitationLabel', () => {
  it('accepts a label that is exactly one citation', () => {
    expect(parseCitationLabel('[src: tasks/задание.pdf#p12]')?.relPath).toBe('задание.pdf')
    expect(parseCitationLabel('  [src: tasks/задание.pdf#p12]  ')?.relPath).toBe('задание.pdf')
  })

  it('refuses a label that carries anything else', () => {
    expect(parseCitationLabel('см. [src: tasks/задание.pdf#p12]')).toBeNull()
    expect(parseCitationLabel('[src: tasks/а.pdf] [src: tasks/б.pdf]')).toBeNull()
    expect(parseCitationLabel('обычная ссылка')).toBeNull()
  })
})

describe('isCitationHref', () => {
  it('recognises the href our citations carry and nothing else', () => {
    expect(isCitationHref(CITATION_HREF)).toBe(true)
    expect(isCitationHref(' #cite ')).toBe(true)
    expect(isCitationHref('#citations')).toBe(false)
    expect(isCitationHref('https://example.com')).toBe(false)
    expect(isCitationHref(undefined)).toBe(false)
  })
})

describe('citationLabel', () => {
  it('says the file and the place the way a person reads them', () => {
    const [page] = parseCitations('[src: tasks/ЭОМ/задание.pdf#p12]')
    const [sheet] = parseCitations('[src: tasks/кабели.xlsx#Ведомость!C5:D6]')
    const [heading] = parseCitations('[src: tasks/ПЗ.docx#h:Кабельный журнал]')
    const [plain] = parseCitations('[src: tasks/данные.csv]')

    expect(citationLabel(page)).toBe('задание.pdf, с. 12')
    expect(citationLabel(sheet)).toBe('кабели.xlsx — Ведомость!C5:D6')
    expect(citationLabel(heading)).toBe('ПЗ.docx — Кабельный журнал')
    expect(citationLabel(plain)).toBe('данные.csv')
  })
})
