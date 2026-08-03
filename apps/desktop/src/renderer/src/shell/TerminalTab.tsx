import { useEffect, useState } from 'react'
import TerminalView from './TerminalView'
import { setActiveTerminalId } from './terminal-read-pure'
import {
  agentTerminalProcessIds,
  syncAgentTerminalSnapshot,
  agentTerminalBacklog,
  seedAgentTerminalCommand
} from './vendor/hermes/agent-terminal-stream'

const EMPTY_HINT =
  'Здесь появится вывод фоновых команд, которые запустит агент. Это только чтение — ' +
  'вводить команды сюда нельзя.'

/** "Терминал" — a bottom-panel tab, one sub-tab per background process
 * (tasks 1.6.B6.12–B6.14, contract: specs/workbench-panels.md).
 *
 * The output buffers do NOT live here: they live in the vendored island, fed
 * by the shell, which is mounted for the life of the window. This component
 * only decides which process is on screen — so collapsing the panel loses
 * nothing, and a tab opened long after a command started still shows all of
 * it.
 *
 * `active` gates the same way the processes tab does: a hidden tab asks the
 * gateway for nothing. */
export default function TerminalTab({ active }: { active: boolean }) {
  const [procIds, setProcIds] = useState<string[]>(() => agentTerminalProcessIds())
  const [selected, setSelected] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!active) return
    // Seed from the island first: output can have arrived while this tab was
    // hidden, and the tab strip must show those processes rather than pretend
    // nothing ran. Deferred to a microtask for the same reason as GoalBadge's
    // first read — the effect body itself must not drive a state update
    // (react-hooks/set-state-in-effect).
    queueMicrotask(() => setProcIds(agentTerminalProcessIds()))

    const unsubscribe = window.aecpilot.onChatEvent((event) => {
      const payload = (event as { payload?: { process_id?: unknown } }).payload
      const procId = typeof payload?.process_id === 'string' ? payload.process_id : ''
      if (!procId) return

      if (event.type === 'agent.terminal.output') {
        // The chunk itself was already buffered by the shell — this only opens
        // a tab for a process not seen before.
        setProcIds((ids) => (ids.includes(procId) ? ids : [...ids, procId]))
        return
      }
      if (event.type === 'terminal.close') {
        // Task 1.6.B6.14: the agent dropped its own tab. The PROCESS is not
        // touched — no `process.kill` goes out here, and an unknown id is
        // simply not in the list, so it falls out as a no-op.
        setProcIds((ids) => ids.filter((id) => id !== procId))
      }
    })
    return unsubscribe
  }, [active])

  // Fill in the commands (and any output produced before this window existed)
  // from `process.list` — the event carries neither. A snapshot is only ever
  // seeded into an EMPTY buffer: their sync compares against the previous
  // SNAPSHOT first, so a first snapshot on top of streamed output would append
  // the whole thing again (pinned in agent-terminal-stream.test.ts).
  const [commands, setCommands] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!active) return
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const result = await window.aecpilot.listProcesses()
        if (cancelled) return
        const labels: Record<string, string> = {}
        for (const entry of result.own) {
          labels[entry.session_id] = entry.command ?? ''
          const tail = entry.output_tail ?? entry.output_preview ?? ''
          if (tail && !agentTerminalBacklog(entry.session_id)) {
            seedAgentTerminalCommand(entry.session_id, entry.command ?? '')
            syncAgentTerminalSnapshot(entry.session_id, tail)
          }
        }
        setCommands(labels)
        setProcIds((ids) => {
          const extra = Object.keys(labels).filter(
            (id) => !ids.includes(id) && agentTerminalBacklog(id)
          )
          return extra.length === 0 ? ids : [...ids, ...extra]
        })
      } catch {
        // The tab is about the output stream; a failed process listing costs
        // it labels, not content.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [active])

  const current = selected !== undefined && procIds.includes(selected) ? selected : procIds[0]

  // Which process the agent's `read_terminal` sees — the tab selection, as in
  // the donor. Cleared when this tab is not on screen: a terminal nobody is
  // looking at is not "the visible terminal" (task 1.6.B6.16).
  useEffect(() => {
    setActiveTerminalId(active ? (current ?? null) : null)
    return () => setActiveTerminalId(null)
  }, [active, current])

  if (procIds.length === 0) {
    return <div className="settings-section__empty">{EMPTY_HINT}</div>
  }

  return (
    <div className="terminal-tab">
      <div className="terminal-tab__strip" role="tablist" aria-label="Процессы с выводом">
        {procIds.map((procId) => (
          <button
            key={procId}
            type="button"
            role="tab"
            aria-selected={procId === current}
            className={
              procId === current
                ? 'terminal-tab__proc terminal-tab__proc--active'
                : 'terminal-tab__proc'
            }
            title={commands[procId] || procId}
            onClick={() => setSelected(procId)}
          >
            {commands[procId] || procId}
          </button>
        ))}
      </div>
      {current && <TerminalView key={current} procId={current} />}
    </div>
  )
}
