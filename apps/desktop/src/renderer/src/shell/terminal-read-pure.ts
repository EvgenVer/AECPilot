// Serializing the terminal buffer for the agent's `read_terminal` tool
// (task 1.6.B6.16, contract: specs/workbench-panels.md §Чтение терминала).
//
// Pure, and node-tested: this is the one place where a mistake costs the agent
// 30 seconds of a stalled turn (their `_block(..., timeout=30)`,
// `tui_gateway/server.py:4370`), so its edge cases are pinned rather than
// tried out in the app.

import { hasAnsiCodes, parseAnsi } from '../chat/vendor/hermes/ansi-pure'
import { agentTerminalBacklog } from './vendor/hermes/agent-terminal-stream'
import type { TerminalReadPayload } from '../../../shared/gateway/types'

/** Their default window is the visible screen — xterm's `term.rows`. We have
 * no rows: the view is a scrolling block of text. 40 is what a bottom panel at
 * its default height holds, and it is only a DEFAULT: the tool asks for what
 * it wants with `start`/`count`. */
export const DEFAULT_VIEWPORT_ROWS = 40

/** Strips ANSI and normalizes line endings, then splits. The donor's
 * `translateToString(true)` drops SGR colours before handing text to the tool —
 * the agent wants the output, not its paint. */
function toLines(buffer: string): string[] {
  const plain = hasAnsiCodes(buffer)
    ? parseAnsi(buffer)
        .map((segment) => segment.text)
        .join('')
    : buffer
  return plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/** Serializes `buffer` into the shape their `read_terminal` tool expects.
 *
 * Field names and semantics are the donor's
 * (`apps/desktop/src/app/right-sidebar/terminal/buffer.ts`): absolute line
 * indices into the whole buffer, so the tool can page with `start`/`count`
 * against `total_lines`.
 *
 * Two fields are honest derivations rather than hardware readings, because
 * this app renders text and not a terminal: `viewport_rows` is the window size
 * used for this answer, and `cursor_row` is the last line — output ends where
 * the buffer ends. Nothing here is invented beyond that.
 *
 * An empty buffer answers with zeroes and an empty string. That is a valid
 * answer and must still be sent: silence costs the agent half a minute. */
export function serializeTerminalBuffer(
  buffer: string,
  options: { start?: number; count?: number; viewportRows?: number } = {}
): TerminalReadPayload {
  const rows =
    options.viewportRows !== undefined && options.viewportRows > 0
      ? Math.floor(options.viewportRows)
      : DEFAULT_VIEWPORT_ROWS

  if (!buffer) {
    return { total_lines: 0, start: 0, end: 0, viewport_rows: rows, cursor_row: 0, text: '' }
  }

  const lines = toLines(buffer)
  const total = lines.length

  // Default window = the tail, which is what a reader sees: their default is
  // the viewport, and ours is scrolled to the bottom. A negative or fractional
  // `start` from the tool is clamped instead of trusted — Python's negative
  // indexing habit must not become a surprise slice here.
  const requestedStart = options.start ?? Math.max(0, total - rows)
  const start = Math.min(Math.max(0, Math.floor(requestedStart)), total)
  const requestedCount = options.count ?? rows
  const count = Math.max(1, Math.floor(requestedCount))
  const end = Math.min(start + count, total)

  const window = lines.slice(start, end)
  // Trailing blank lines carry nothing and cost tokens (their serializer pops
  // them too).
  while (window.length > 0 && window[window.length - 1].trim() === '') window.pop()

  return {
    total_lines: total,
    start,
    end,
    viewport_rows: rows,
    cursor_row: Math.max(0, total - 1),
    text: window.join('\n')
  }
}

// --- Which terminal the agent reads ----------------------------------------
// Module state, mirroring the donor's `buffer.ts`: the tab selection decides
// which process `read_terminal` sees. Kept out of React state on purpose — the
// answer must be available to the event handler at the shell level even when
// the panel that owns the tabs is collapsed and unmounted (then it is null,
// and the agent is told there is nothing to read, which is the truth).

let activeId: string | null = null

export function setActiveTerminalId(id: string | null): void {
  activeId = id
}

export function activeTerminalId(): string | null {
  return activeId
}

/** Answers one `terminal.read.request` (task 1.6.B6.16).
 *
 * Everything about this call is synchronous on purpose: their bridge holds the
 * agent's turn until the answer arrives, up to 30 s
 * (`_block(..., timeout=30)`), so there is nothing here to wait for — the
 * buffer is already in memory. With no terminal on screen it answers with an
 * empty payload rather than staying silent, which would cost the agent the
 * full timeout for no reason.
 *
 * `respond` is passed in rather than imported so this module keeps its hands
 * off `window` — the shell hands it the IPC bridge. */
export function respondToTerminalRead(
  payload: { request_id?: string; start?: number; count?: number } | undefined,
  respond: (requestId: string, text: string) => void
): void {
  const requestId = payload?.request_id
  // No id, nothing to answer: their `_respond` keys the pending map by it and
  // would reject the call with 4009.
  if (typeof requestId !== 'string' || requestId === '') return

  const procId = activeTerminalId()
  const serialized = serializeTerminalBuffer(procId ? agentTerminalBacklog(procId) : '', {
    start: payload?.start,
    count: payload?.count
  })
  respond(requestId, JSON.stringify(serialized))
}
