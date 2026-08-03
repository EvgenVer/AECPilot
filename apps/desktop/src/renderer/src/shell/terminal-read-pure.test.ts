// Unit tests for the `read_terminal` serializer (task 1.6.B6.16).

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activeTerminalId,
  DEFAULT_VIEWPORT_ROWS,
  respondToTerminalRead,
  serializeTerminalBuffer,
  setActiveTerminalId
} from './terminal-read-pure'
import type { TerminalReadPayload } from '../../../shared/gateway/types'
import { forgetAgentTerminal, writeAgentTerminalChunk } from './vendor/hermes/agent-terminal-stream'

const TEN_LINES = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n')

describe('serializeTerminalBuffer', () => {
  it('answers an empty buffer with zeroes, not with silence', () => {
    expect(serializeTerminalBuffer('')).toEqual({
      total_lines: 0,
      start: 0,
      end: 0,
      viewport_rows: DEFAULT_VIEWPORT_ROWS,
      cursor_row: 0,
      text: ''
    })
  })

  it('returns the whole buffer when it is shorter than the window', () => {
    const result = serializeTerminalBuffer(TEN_LINES)

    expect(result.total_lines).toBe(10)
    expect(result.start).toBe(0)
    expect(result.end).toBe(10)
    expect(result.cursor_row).toBe(9)
    expect(result.text).toBe(TEN_LINES)
  })

  it('pages with start and count, reporting the total rather than the window', () => {
    const result = serializeTerminalBuffer(TEN_LINES, { start: 2, count: 3 })

    expect(result.start).toBe(2)
    expect(result.end).toBe(5)
    expect(result.total_lines).toBe(10)
    expect(result.text).toBe('line 2\nline 3\nline 4')
  })

  it('clamps a window that runs past the end instead of failing', () => {
    const result = serializeTerminalBuffer(TEN_LINES, { start: 8, count: 100 })

    expect(result.start).toBe(8)
    expect(result.end).toBe(10)
    expect(result.text).toBe('line 8\nline 9')
  })

  it('clamps a start past the end to an empty window, still reporting the total', () => {
    const result = serializeTerminalBuffer(TEN_LINES, { start: 50, count: 5 })

    expect(result.start).toBe(10)
    expect(result.end).toBe(10)
    expect(result.total_lines).toBe(10)
    expect(result.text).toBe('')
  })

  // Their side has a habit of negative indices meaning "from the end"; here it
  // must not silently slice something else.
  it('clamps a negative or fractional start and a zero count', () => {
    expect(serializeTerminalBuffer(TEN_LINES, { start: -5, count: 2 }).start).toBe(0)
    expect(serializeTerminalBuffer(TEN_LINES, { start: 2.7, count: 2 }).start).toBe(2)
    expect(serializeTerminalBuffer(TEN_LINES, { start: 0, count: 0 }).end).toBe(1)
  })

  it('defaults to the tail — what the reader is actually looking at', () => {
    const many = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n')
    const result = serializeTerminalBuffer(many, { viewportRows: 5 })

    expect(result.start).toBe(95)
    expect(result.end).toBe(100)
    expect(result.viewport_rows).toBe(5)
    expect(result.text).toBe('line 95\nline 96\nline 97\nline 98\nline 99')
  })

  it('strips ANSI colours and normalizes CRLF', () => {
    const result = serializeTerminalBuffer('\u001b[32mready\u001b[0m on 3000\r\nnext line\r\n')

    expect(result.text).toBe('ready on 3000\nnext line')
    expect(result.text).not.toContain('\u001b')
    expect(result.text).not.toContain('\r')
  })

  it('drops trailing blank lines from the window but counts them in the total', () => {
    const result = serializeTerminalBuffer('one\ntwo\n\n\n')

    expect(result.total_lines).toBe(5)
    expect(result.text).toBe('one\ntwo')
  })
})

describe('active terminal id', () => {
  it('starts empty, follows the tab selection and can be cleared', () => {
    expect(activeTerminalId()).toBeNull()

    setActiveTerminalId('p1')
    expect(activeTerminalId()).toBe('p1')

    setActiveTerminalId(null)
    expect(activeTerminalId()).toBeNull()
  })
})

// Their bridge holds the agent's turn until this answer arrives (30 s), so the
// property that matters is not "fast enough" but "synchronous and
// unconditional": no await stands between the event and the reply, and every
// state of the app produces one.
describe('respondToTerminalRead', () => {
  afterEach(() => {
    setActiveTerminalId(null)
    forgetAgentTerminal('p-read')
  })

  it('answers immediately with an empty buffer when no terminal is open', () => {
    const respond = vi.fn()
    respondToTerminalRead({ request_id: 'r1' }, respond)

    expect(respond).toHaveBeenCalledTimes(1)
    const [requestId, text] = respond.mock.calls[0]
    expect(requestId).toBe('r1')
    const payload = JSON.parse(text as string) as TerminalReadPayload
    expect(payload.total_lines).toBe(0)
    expect(payload.text).toBe('')
  })

  it('answers with the visible terminal buffer, serialized as a JSON string', () => {
    writeAgentTerminalChunk('p-read', 'line 0\nline 1\n')
    setActiveTerminalId('p-read')

    const respond = vi.fn()
    respondToTerminalRead({ request_id: 'r2', start: 1, count: 1 }, respond)

    const [, text] = respond.mock.calls[0]
    // A JSON STRING, not an object: their handler forwards it verbatim to the
    // tool, which parses it itself (`server.py:11281`).
    expect(typeof text).toBe('string')
    const payload = JSON.parse(text as string) as TerminalReadPayload
    expect(payload).toMatchObject({ total_lines: 3, start: 1, end: 2, text: 'line 1' })
  })

  it('says nothing when there is no request id — there is nothing to answer', () => {
    const respond = vi.fn()
    respondToTerminalRead({}, respond)
    respondToTerminalRead(undefined, respond)

    expect(respond).not.toHaveBeenCalled()
  })
})
