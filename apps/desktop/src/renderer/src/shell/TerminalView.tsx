import { useEffect, useRef, useState } from 'react'
import { hasAnsiCodes, parseAnsi } from '../chat/vendor/hermes/ansi-pure'
import { registerAgentTerminalWriter, TERMINAL_RESET } from './vendor/hermes/agent-terminal-stream'

/** How close to the bottom still counts as "at the bottom". A few pixels of
 * slack, because a scroll position is rarely exact after a repaint. */
const STICK_TOLERANCE_PX = 24

/** Whether the view should keep following new output. Pure so the rule is
 * testable — jsdom does no layout, and this is the whole of the autoscroll
 * decision (task 1.6.B6.13). */
export function isNearBottom(metrics: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= STICK_TOLERANCE_PX
}

/** One background process's output (task 1.6.B6.13).
 *
 * Read-only, and rendered through our own ANSI parser rather than xterm
 * (owner decision 1 of block 5 — no `node-pty`, no terminal emulator). The
 * parser runs over the WHOLE buffer, not per chunk: a chunk cut in the middle
 * of an escape sequence would otherwise leave its colour behind and paint
 * everything after it (specs/workbench-panels.md, «чанк, разорванный посреди
 * escape-последовательности»).
 *
 * The stream itself lives in the vendored island, so a tab opened mid-stream
 * replays what it missed and one closed by hand loses nothing. */
export default function TerminalView({ procId }: { procId: string }) {
  const [text, setText] = useState('')
  const bodyRef = useRef<HTMLPreElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    // No reset of the text here: the tab strip mounts this component keyed by
    // process id, so a different process is a different instance, starting
    // empty. The island then replays that process's backlog into this writer
    // synchronously on registration, so nothing is missed between mount and
    // the next chunk.
    return registerAgentTerminalWriter(procId, (chunk) => {
      // A full rewrite arrives prefixed with the terminal-reset escape: their
      // snapshot path uses it when the registry's tail slid out from under our
      // buffer. Our parser does not implement ESC c, so it is acted on here.
      setText((current) =>
        chunk.startsWith(TERMINAL_RESET) ? chunk.slice(TERMINAL_RESET.length) : current + chunk
      )
    })
  }, [procId])

  useEffect(() => {
    const node = bodyRef.current
    if (!node || !stickRef.current) return
    node.scrollTop = node.scrollHeight
  }, [text])

  return (
    <pre
      className="terminal-view"
      ref={bodyRef}
      tabIndex={0}
      aria-label="Вывод фонового процесса"
      onScroll={(event) => {
        // Scrolling up detaches the view; coming back to the bottom
        // re-attaches it. Anything else would either fight the reader or
        // freeze the output where they left it.
        stickRef.current = isNearBottom(event.currentTarget)
      }}
    >
      {hasAnsiCodes(text)
        ? parseAnsi(text).map((segment, index) => (
            <span
              key={index}
              className={`ansi${segment.fg ? ` ansi--${segment.fg}` : ''}${
                segment.bold ? ' ansi--bold' : ''
              }`}
            >
              {segment.text}
            </span>
          ))
        : text}
    </pre>
  )
}
