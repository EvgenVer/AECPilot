/**
 * Live agent-terminal output, buffered per background process — vendored from
 * Hermes (task 1.6.B6.11).
 *
 * Source: `apps/desktop/src/app/right-sidebar/terminal/agent-terminal-stream.ts`,
 * NousResearch/hermes-agent (MIT). Ported as an island: the logic is theirs,
 * unchanged, and like the original this file imports nothing at all.
 *
 * Chunks arrive as `agent.terminal.output` events keyed by process id (their
 * gateway's `_wire_agent_terminal_output`). A capped per-process backlog lets a
 * tab opened mid-stream replay what it missed, and lets a closed-then-reopened
 * tab restore its history.
 *
 * ONE THING TO KNOW BEFORE READING THE VIEW: when a snapshot diverges from the
 * buffer, `syncAgentTerminalSnapshot` writes the whole buffer back prefixed
 * with `\x1bc` — the terminal-reset escape. Their xterm executes it and clears
 * the screen. Ours does not: our ANSI parser (`chat/vendor/hermes/ansi-pure.ts`)
 * only consumes CSI and OSC sequences, and `ESC c` is neither, so the VIEW must
 * treat a chunk starting with `\x1bc` as "replace everything" before parsing.
 * Kept as theirs rather than replaced with a flag, so the file stays a
 * verbatim island (specs/workbench-panels.md, fact 6).
 */

type Writer = (chunk: string) => void

const writers = new Map<string, Writer>()
const backlog = new Map<string, string>()
const commandHeaders = new Map<string, string>()
const lastSnapshots = new Map<string, string>()
const seededCommands = new Set<string>()

const MAX_BACKLOG = 256_000

/** The reset marker their snapshot path prefixes a full rewrite with. Exported
 * so the view names it instead of repeating the escape. */
export const TERMINAL_RESET = '\x1bc'

/** A live agent terminal registers its write and replays the backlog.
 *  Returns an idempotent unregister. */
export function registerAgentTerminalWriter(procId: string, write: Writer): () => void {
  writers.set(procId, write)

  const history = backlog.get(procId)

  if (history) {
    write(history)
  }

  return () => {
    if (writers.get(procId) === write) {
      writers.delete(procId)
    }
  }
}

/** Append a streamed chunk: buffer it (capped) for future opens and write it to
 *  the live terminal, if one is mounted. */
export function writeAgentTerminalChunk(procId: string, chunk: string): void {
  if (!procId || !chunk) {
    return
  }

  const next = (backlog.get(procId) ?? '') + chunk
  backlog.set(procId, next.length > MAX_BACKLOG ? next.slice(-MAX_BACKLOG) : next)
  writers.get(procId)?.(chunk)
}

/** Seed the tab with the command immediately, so an agent terminal never opens
 *  as an empty void while stdout is still pending or not yet observed. */
export function seedAgentTerminalCommand(procId: string, command: string): void {
  const trimmed = command.trim()

  if (!procId || !trimmed || seededCommands.has(procId)) {
    return
  }

  seededCommands.add(procId)
  const header = `$ ${trimmed}\r\n`
  commandHeaders.set(procId, header)
  writeAgentTerminalChunk(procId, header)
}

/** Ingest a full output snapshot from `process.list`. This is the fallback for
 *  a gateway that does not stream, and a seed for tabs opened after output
 *  already exists. If it extends our current backlog, append only the delta; if
 *  the registry's rolling tail slid, reset to that tail. */
export function syncAgentTerminalSnapshot(procId: string, output: string): void {
  if (!procId || !output) {
    return
  }

  const current = backlog.get(procId) ?? ''
  const header = commandHeaders.get(procId) ?? ''
  const body = header && current.startsWith(header) ? current.slice(header.length) : current
  const previous = lastSnapshots.get(procId) ?? ''

  if (output === previous || output === body || body.endsWith(output)) {
    lastSnapshots.set(procId, output)

    return
  }

  if (output.startsWith(previous)) {
    writeAgentTerminalChunk(procId, output.slice(previous.length))
    lastSnapshots.set(procId, output)

    return
  }

  if (output.startsWith(body)) {
    writeAgentTerminalChunk(procId, output.slice(body.length))
    lastSnapshots.set(procId, output)

    return
  }

  const next = `${header}${output}`.slice(-MAX_BACKLOG)
  lastSnapshots.set(procId, output)
  backlog.set(procId, next)
  writers.get(procId)?.(`${TERMINAL_RESET}${next}`)
}

/** What a tab shows when it opens: everything buffered for this process so far.
 * Added here rather than in the view because the buffer is module state — the
 * view has no other way to read it, and their own component asks xterm, which
 * we do not have. */
export function agentTerminalBacklog(procId: string): string {
  return backlog.get(procId) ?? ''
}

/** Every process this window has seen output from, in first-seen order — the
 * tab strip's source of truth (task 1.6.B6.12). Added here because the buffers
 * are module state: their component asks its own store, which we do not have. */
export function agentTerminalProcessIds(): string[] {
  return [...backlog.keys()]
}

/** Forget one process entirely (task 1.6.B6.14): its tab is gone, and keeping
 * its buffer would silently hold up to 256 KB per closed tab for the life of
 * the window. Not in the donor — their tabs are torn down by their own store. */
export function forgetAgentTerminal(procId: string): void {
  writers.delete(procId)
  backlog.delete(procId)
  commandHeaders.delete(procId)
  lastSnapshots.delete(procId)
  seededCommands.delete(procId)
}
