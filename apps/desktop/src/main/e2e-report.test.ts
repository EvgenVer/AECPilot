// Technical debt found 2026-10-26: the acceptance report wrapped every transcript in a
// ``` fence, and an agent answer that carried its own ``` code block closed that fence
// early — the rest of the page rendered as stray code. The module is the e2e report
// script (`e2e/lib/report.mjs`); the test lives here because `e2e/**` is excluded from
// the vitest run (`vitest.config.ts`).

import { describe, expect, it } from 'vitest'

import { fenceFor } from '../../e2e/lib/report.mjs'

/** Lines between the opening fence and the first line that closes it (CommonMark: a
 *  backtick run at least as long as the opening one, nothing else on the line). */
function fencedBody(markdown: string): string[] {
  const lines = markdown.split('\n')
  const open = lines[0].match(/^(`{3,})/)?.[1] ?? ''
  const close = lines.findIndex(
    (line, i) => i > 0 && /^`+\s*$/.test(line) && line.trim().length >= open.length
  )
  return lines.slice(1, close)
}

describe('fenceFor', () => {
  it('uses three backticks for text without any', () => {
    expect(fenceFor('user: hello\nagent: hi')).toBe('```')
  })

  it('is longer than the longest backtick run inside the text', () => {
    expect(fenceFor('agent:\n```python\nprint(1)\n```')).toBe('````')
    expect(fenceFor('a ```` b ``````` c')).toBe('````````')
  })

  it('keeps an inner code block inside the transcript', () => {
    const transcript = 'user: show code\nagent:\n```python\nprint(1)\n```\ndone'
    const fence = fenceFor(transcript)
    const markdown = [`${fence}text`, transcript, fence].join('\n')
    expect(fencedBody(markdown)).toEqual(transcript.split('\n'))
  })
})
