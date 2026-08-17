// The click that closes the loop between an answer and the page it came from
// (tasks 2.13/2.14, SPEC UR3 and AC1).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $openDocument, closeAllDocuments } from '../viewers/viewer-store'

import { CitationChip } from './CitationLink'
import { parseCitationLabel, parseCitations } from './citation-pure'
import { forgetVerdicts, rememberVerdicts } from './quote-verdicts'

function renderChip(text: string): void {
  const [citation] = parseCitations(text)
  render(<CitationChip citation={citation} />)
}

describe('CitationChip', () => {
  beforeEach(() => {
    // Не `closeDocument()`: с задачи 4.1 он закрывает ОДНУ вкладку, а тесту
    // нужен чистый просмотрщик — иначе документ из прошлого теста остаётся.
    closeAllDocuments()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the file and the page, not the machine syntax', () => {
    renderChip('[src: tasks/ЭОМ/задание.pdf#p12]')

    expect(screen.getByRole('button').textContent).toContain('задание.pdf, с. 12')
  })

  it('keeps the raw citation reachable as the title — it is what an engineer copies', () => {
    renderChip('[src: tasks/ЭОМ/задание.pdf#p12]')

    expect(screen.getByRole('button').getAttribute('title')).toBe(
      '[src: tasks/ЭОМ/задание.pdf#p12]'
    )
  })

  it('asks the viewer for the cited file, source and page', () => {
    renderChip('[src: tasks/ЭОМ/задание.pdf#p12]')

    fireEvent.click(screen.getByRole('button'))

    expect($openDocument.get()).toMatchObject({
      locator: { page: 12 },
      relPath: 'ЭОМ/задание.pdf',
      sourceId: 'tasks'
    })
  })

  it('opens a citation with no place at all — naming the file is most of the answer', () => {
    renderChip('[src: tasks/данные.csv]')

    fireEvent.click(screen.getByRole('button'))

    expect($openDocument.get()).toMatchObject({ locator: {}, relPath: 'данные.csv' })
  })

  it('re-opens the same place on a second click', () => {
    renderChip('[src: tasks/задание.pdf#p3]')

    fireEvent.click(screen.getByRole('button'))
    const first = $openDocument.get()?.token
    fireEvent.click(screen.getByRole('button'))

    // A new token, so the viewer scrolls back to the cited page instead of
    // leaving the reader wherever they had scrolled to.
    expect($openDocument.get()?.token).not.toBe(first)
  })
})

describe('пометка непроверенной выдержки (задача 3.31b)', () => {
  // Автоочистка @testing-library в dom-проекте не включена: без неё дерево
  // прошлого теста остаётся, и `getByRole` находит две фишки вместо одной.
  afterEach(() => {
    cleanup()
    forgetVerdicts()
  })

  const citation = parseCitationLabel('[src: p/а.pdf#p12]')!

  it('обычная фишка не кричит и открывает документ', () => {
    render(<CitationChip citation={citation} />)

    const chip = screen.getByRole('button')
    expect(chip.querySelector('.codicon-warning')).toBeNull()
    expect(chip.getAttribute('title')).toBe('[src: p/а.pdf#p12]')
  })

  it('выдержка, которой нет в источнике, видна на фишке и названа в подсказке', () => {
    rememberVerdicts('[src: p/а.pdf#p12](#cite) «выдуманная фраза про мощность»', [
      { text: 'выдуманная фраза про мощность', start: 26, end: 55, ok: false, reason: '' }
    ])

    render(<CitationChip citation={citation} />)

    const chip = screen.getByRole('button')
    expect(chip.querySelector('.codicon-warning')).not.toBeNull()
    // Человеку показывают САМУ фразу: «что-то не так» без неё — не сведения.
    expect(chip.getAttribute('title')).toContain('выдуманная фраза про мощность')
  })

  it('пометка не переезжает на соседнюю цитату', () => {
    rememberVerdicts('[src: p/а.pdf#p12](#cite) «выдуманная фраза про мощность»', [
      { text: 'выдуманная фраза про мощность', start: 26, end: 55, ok: false, reason: '' }
    ])

    render(<CitationChip citation={parseCitationLabel('[src: p/б.xlsx]')!} />)

    expect(screen.getByRole('button').querySelector('.codicon-warning')).toBeNull()
  })
})
