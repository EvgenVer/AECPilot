// Task T72: «Открыть содержащую папку» — inside the project or a source folder
// opens Explorer, anything else is refused in words.

import { describe, expect, it } from 'vitest'

import { decideReveal, revealAllowed, revealOutsideError } from './reveal-path-pure'

const win = process.platform === 'win32'
const PROJECT = win ? 'D:\\ЮП' : '/ЮП'
const SOURCE = win ? 'E:\\Архив\\КР' : '/archive/kr'
const IN_PROJECT = win
  ? 'D:\\ЮП\\workspace\\tasks\\notes\\T-003.docx'
  : '/ЮП/workspace/tasks/notes/T-003.docx'
const IN_SOURCE = win ? 'E:\\Архив\\КР\\лист-1.pdf' : '/archive/kr/лист-1.pdf'
const OUTSIDE = win ? 'C:\\Windows\\System32\\drivers\\etc\\hosts' : '/etc/hosts'

describe('decideReveal', () => {
  it('a file inside the project — yes', () => {
    expect(decideReveal(PROJECT, [SOURCE], IN_PROJECT)).toEqual({ ok: true, absPath: IN_PROJECT })
  })

  it('a relative path resolves against the project, as the agent writes it', () => {
    expect(decideReveal(PROJECT, [], 'workspace/tasks/notes/T-003.docx')).toEqual({
      ok: true,
      absPath: IN_PROJECT
    })
  })

  it('a file inside a connected source folder — yes', () => {
    expect(decideReveal(PROJECT, [SOURCE], IN_SOURCE)).toEqual({ ok: true, absPath: IN_SOURCE })
  })

  it('a file elsewhere — refused in words', () => {
    expect(decideReveal(PROJECT, [SOURCE], OUTSIDE)).toEqual({
      ok: false,
      error: revealOutsideError()
    })
    expect(revealOutsideError()).toMatch(/\S+ \S+/)
  })

  it('no project and no sources — nothing is inside', () => {
    expect(decideReveal(undefined, [], IN_PROJECT)).toMatchObject({ ok: false })
  })

  it('a link is not a file', () => {
    expect(decideReveal(PROJECT, [], 'https://example.com/x')).toMatchObject({ ok: false })
  })

  it('the real-path check uses the same roots', () => {
    expect(revealAllowed(PROJECT, [SOURCE], IN_SOURCE)).toBe(true)
    expect(revealAllowed(PROJECT, [SOURCE], OUTSIDE)).toBe(false)
  })
})
