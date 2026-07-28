/**
 * Minimal ANSI SGR parser for terminal output shown inside a tool card —
 * vendored from Hermes (task 1.6.11).
 *
 * Source: `apps/desktop/src/lib/ansi.ts`, NousResearch/hermes-agent (MIT).
 * Logic kept as theirs; what changed is the output: their segments carry a
 * Tailwind class name, ours carry a plain colour name that shell.css maps to
 * our own tokens (decision C — no Tailwind here). Split off as a pure module
 * so the parsing rules are pinned by node tests.
 *
 * Only the codes that actually turn up are handled — colour, bold, reset.
 * Cursor motions and other CSI sequences are consumed and dropped, which is
 * the point: without this the reader sees `[0;32m` in the middle of a
 * command's output.
 */

export type AnsiColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'bright-black'
  | 'bright-red'
  | 'bright-green'
  | 'bright-yellow'
  | 'bright-blue'
  | 'bright-magenta'
  | 'bright-cyan'
  | 'bright-white'

export interface AnsiSegment {
  bold: boolean
  /** Colour name, or null for the default foreground. */
  fg: AnsiColor | null
  text: string
}

const FG_BY_CODE: Record<number, AnsiColor> = {
  30: 'black',
  31: 'red',
  32: 'green',
  33: 'yellow',
  34: 'blue',
  35: 'magenta',
  36: 'cyan',
  37: 'white',
  90: 'bright-black',
  91: 'bright-red',
  92: 'bright-green',
  93: 'bright-yellow',
  94: 'bright-blue',
  95: 'bright-magenta',
  96: 'bright-cyan',
  97: 'bright-white'
}

// CSI = ESC '[' params final. Only SGR (final 'm') is interpreted; every other
// final byte is still MATCHED so the sequence is consumed instead of leaking
// into the text.
// eslint-disable-next-line no-control-regex
const CSI_RE = /\x1b\[([\d;]*)([\x40-\x7e])/g
// Single-char escapes and OSC strings — dropped whole.
// eslint-disable-next-line no-control-regex
const OTHER_ESCAPE_RE = /\x1b[@-Z\\-_]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

/** Cheap check so the parser is only paid for when there is something to parse. */
export function hasAnsiCodes(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1b/.test(text)
}

export function parseAnsi(input: string): AnsiSegment[] {
  if (!input) return []

  const cleaned = input.replace(OTHER_ESCAPE_RE, '')
  const segments: AnsiSegment[] = []
  let cursor = 0
  let bold = false
  let fg: AnsiColor | null = null

  const pushText = (text: string): void => {
    if (!text) return
    const last = segments.at(-1)
    // Merge into the previous segment when nothing about the style changed —
    // otherwise every code boundary would become its own <span>.
    if (last && last.bold === bold && last.fg === fg) {
      last.text += text
      return
    }
    segments.push({ bold, fg, text })
  }

  CSI_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = CSI_RE.exec(cleaned)) !== null) {
    if (match.index > cursor) pushText(cleaned.slice(cursor, match.index))

    if (match[2] === 'm') {
      const codes = (match[1] ?? '')
        .split(';')
        .map((part) => (part === '' ? 0 : Number(part)))
        .filter((value) => Number.isFinite(value))

      for (let i = 0; i < codes.length; i += 1) {
        const code = codes[i] as number
        if (code === 0) {
          bold = false
          fg = null
        } else if (code === 1) {
          bold = true
        } else if (code === 22) {
          bold = false
        } else if (code === 39) {
          fg = null
        } else if (code in FG_BY_CODE) {
          fg = FG_BY_CODE[code] as AnsiColor
        } else if (code === 38) {
          // 256-colour / truecolour — skip the arguments we do not render,
          // or their numbers would be read as further codes.
          if (codes[i + 1] === 5) i += 2
          else if (codes[i + 1] === 2) i += 4
        }
        // Background colours and other effects are ignored on purpose: the
        // card has its own surface, and a terminal's background paint would
        // fight it.
      }
    }

    cursor = CSI_RE.lastIndex
  }

  if (cursor < cleaned.length) pushText(cleaned.slice(cursor))

  return segments
}
