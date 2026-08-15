// The click that closes the loop between an answer and the page it came from
// (tasks 2.13/2.14, SPEC UR3 and AC1).

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $openDocument, closeDocument } from '../viewers/viewer-store'

import { CitationChip } from './CitationLink'
import { parseCitations } from './citation-pure'

function renderChip(text: string): void {
  const [citation] = parseCitations(text)
  render(<CitationChip citation={citation} />)
}

describe('CitationChip', () => {
  beforeEach(() => {
    closeDocument()
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
