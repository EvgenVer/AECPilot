// Component tests for the terminal tab and its view (tasks 1.6.B6.12–B6.14).
//
// The split under test is the real one: the SHELL buffers chunks into the
// vendored island (so a hidden panel loses nothing), and this component only
// shows them and manages the tab strip. So the tests write chunks through the
// island exactly as the shell does, and push the gateway events at the
// component. Every test uses its own process id — the island's buffers are
// module state, as in the donor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TerminalTab from './TerminalTab'
import { isNearBottom } from './TerminalView'
import { activeTerminalId } from './terminal-read-pure'
import { forgetAgentTerminal, writeAgentTerminalChunk } from './vendor/hermes/agent-terminal-stream'

/** The island's buffers are module state (as in the donor), so a test's output
 * would otherwise still be there for the next one. Cleared through the same
 * `forgetAgentTerminal` production uses when the agent closes a tab — no
 * test-only reset hook was added to the island for this. */
const seededProcesses = new Set<string>()

function track(procId: string): string {
  seededProcesses.add(procId)
  return procId
}

const listProcesses = vi.fn()
const killProcess = vi.fn()
let emitChatEvent: ((event: { type: string; payload?: unknown }) => void) | undefined
const onChatEvent = vi.fn((cb: (event: { type: string; payload?: unknown }) => void) => {
  emitChatEvent = cb
  return () => {
    emitChatEvent = undefined
  }
})

beforeEach(() => {
  listProcesses.mockResolvedValue({ own: [], others: [] })
  window.aecpilot = {
    listProcesses,
    killProcess,
    onChatEvent
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  for (const procId of seededProcesses) forgetAgentTerminal(procId)
  seededProcesses.clear()
})

function output(procId: string, chunk: string): void {
  act(() => {
    // What the shell does with the event…
    writeAgentTerminalChunk(track(procId), chunk)
    // …and what this component does with it.
    emitChatEvent?.({ type: 'agent.terminal.output', payload: { process_id: procId, chunk } })
  })
}

describe('TerminalTab', () => {
  it('explains itself when no process has produced output', () => {
    render(<TerminalTab active={true} />)

    expect(screen.getByText(/появится вывод фоновых команд/)).toBeTruthy()
    expect(screen.getByText(/вводить команды сюда нельзя/)).toBeTruthy()
  })

  it('opens a tab on the first output of a new process', () => {
    render(<TerminalTab active={true} />)
    output('p-open', 'building…\n')

    expect(screen.getByRole('tab', { name: 'p-open' })).toBeTruthy()
    expect(screen.getByLabelText('Вывод фонового процесса').textContent).toContain('building…')
  })

  it('labels a tab with its command once process.list answers', async () => {
    listProcesses.mockResolvedValue({
      own: [{ session_id: 'p-label', command: 'npm run dev', output_tail: '' }],
      others: []
    })
    render(<TerminalTab active={true} />)
    output('p-label', 'ready\n')

    await waitFor(() => expect(screen.getByRole('tab', { name: 'npm run dev' })).toBeTruthy())
  })

  it('replays what was buffered before the tab was ever shown', () => {
    // Output arrives while the panel is collapsed: the shell still buffers it.
    writeAgentTerminalChunk(track('p-replay'), 'first line\nsecond line\n')

    render(<TerminalTab active={true} />)

    expect(screen.getByLabelText('Вывод фонового процесса').textContent).toContain('second line')
  })

  it('keeps one tab per process and switches between them', () => {
    render(<TerminalTab active={true} />)
    output('p-a', 'aaa\n')
    output('p-a', 'more aaa\n')
    output('p-b', 'bbb\n')

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByLabelText('Вывод фонового процесса').textContent).toContain('aaa')

    fireEvent.click(screen.getByRole('tab', { name: 'p-b' }))
    expect(screen.getByLabelText('Вывод фонового процесса').textContent).toContain('bbb')
  })

  // Task 1.6.B6.14 — their comment: "the process is untouched, this only drops
  // the view".
  it('drops the tab on terminal.close and kills nothing', () => {
    render(<TerminalTab active={true} />)
    output('p-close', 'работаю\n')
    expect(screen.getByRole('tab', { name: 'p-close' })).toBeTruthy()

    act(() => {
      emitChatEvent?.({ type: 'terminal.close', payload: { process_id: 'p-close' } })
    })

    expect(screen.queryByRole('tab', { name: 'p-close' })).toBeNull()
    expect(killProcess).not.toHaveBeenCalled()
  })

  it('ignores terminal.close for a process it never had', () => {
    render(<TerminalTab active={true} />)
    output('p-known', 'вывод\n')

    act(() => {
      emitChatEvent?.({ type: 'terminal.close', payload: { process_id: 'p-never-seen' } })
      emitChatEvent?.({ type: 'terminal.close', payload: {} })
    })

    expect(screen.getByRole('tab', { name: 'p-known' })).toBeTruthy()
  })

  // Task 1.6.B6.16 — the agent reads the tab that is on screen, and nothing
  // when the panel is not.
  it('publishes the selected process as the one the agent may read', () => {
    const { unmount } = render(<TerminalTab active={true} />)
    output('p-active', 'вывод\n')
    expect(activeTerminalId()).toBe('p-active')

    unmount()
    expect(activeTerminalId()).toBeNull()
  })
})

describe('TerminalView rendering', () => {
  it('renders SGR colours as coloured segments, not as escape codes', () => {
    render(<TerminalTab active={true} />)
    output('p-colour', '\u001b[32mready\u001b[0m on 3000\n')

    const view = screen.getByLabelText('Вывод фонового процесса')
    expect(view.textContent).toContain('ready on 3000')
    expect(view.textContent).not.toContain('[32m')
    expect(view.querySelector('.ansi--green')?.textContent).toBe('ready')
  })

  // A chunk boundary is not a parsing boundary: the parser runs over the whole
  // buffer, so a sequence split across two events still resolves.
  it('survives a chunk cut in the middle of an escape sequence', () => {
    render(<TerminalTab active={true} />)
    output('p-split', 'plain \u001b[3')
    output('p-split', '1mred\u001b[0m tail\n')

    const view = screen.getByLabelText('Вывод фонового процесса')
    expect(view.textContent).toBe('plain red tail\n')
    expect(view.querySelector('.ansi--red')?.textContent).toBe('red')
  })

  it('applies a full-reset chunk instead of appending it', () => {
    render(<TerminalTab active={true} />)
    output('p-reset-view', 'stale\n')
    output('p-reset-view', '\u001bcfresh\n')

    expect(screen.getByLabelText('Вывод фонового процесса').textContent).toBe('fresh\n')
  })

  // jsdom does no layout, so the autoscroll DECISION is tested where it lives:
  // a pure function over the three scroll metrics.
  it('sticks to the bottom until the reader scrolls up', () => {
    expect(isNearBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 200 })).toBe(true)
    expect(isNearBottom({ scrollTop: 790, scrollHeight: 1000, clientHeight: 200 })).toBe(true)
    expect(isNearBottom({ scrollTop: 400, scrollHeight: 1000, clientHeight: 200 })).toBe(false)
    // A view shorter than its box is always at the bottom.
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 200 })).toBe(true)
  })
})
