// Tasks 1.6.B2a.4–B2a.6 — background processes. The behaviour worth pinning:
// no polling while the tab is not visible, no stop button for another
// session's process, and a stopped process changes state rather than vanishing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import ProcessesTab from './ProcessesTab'

const listProcesses = vi.fn()
const killProcess = vi.fn()
/** Captures the tab's own event subscription (task 1.6.B6.4) so a test can
 * push a gateway event at it. */
let emitChatEvent: ((event: { type: string; payload?: unknown }) => void) | undefined
const onChatEvent = vi.fn((cb: (event: { type: string; payload?: unknown }) => void) => {
  emitChatEvent = cb
  return () => {
    emitChatEvent = undefined
  }
})

beforeEach(() => {
  listProcesses.mockResolvedValue({
    own: [
      {
        session_id: 'p1',
        command: 'npm run dev',
        cwd: 'C:/proj',
        pid: 42,
        uptime_seconds: 90,
        status: 'running',
        output_tail: '\u001b[32mready\u001b[0m on 3000'
      }
    ],
    others: [{ session_id: 'p2', command: 'sleep 999', status: 'running', uptime: 5 }]
  })
  killProcess.mockResolvedValue({ status: 'killed' })
  window.aecpilot = {
    listProcesses,
    killProcess,
    onChatEvent
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProcessesTab', () => {
  it('lists this session processes with uptime and pid', async () => {
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('npm run dev')).toBeTruthy())
    expect(screen.getByText(/1 мин/)).toBeTruthy()
    expect(screen.getByText(/pid 42/)).toBeTruthy()
  })

  // A background timer hitting the gateway for a panel nobody can see is pure
  // waste.
  it('makes no request while the tab is not visible', async () => {
    render(<ProcessesTab active={false} />)
    await act(async () => {})
    expect(listProcesses).not.toHaveBeenCalled()
  })

  it('shows other sessions apart, without a stop button', async () => {
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('sleep 999')).toBeTruthy())
    expect(screen.getByText(/только наблюдение/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Остановить' })).toHaveLength(1)
  })

  it('confirms before stopping and reports the outcome', async () => {
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('npm run dev')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Остановить' }).click()
    })
    expect(killProcess).not.toHaveBeenCalled()
    await act(async () => {
      screen.getAllByRole('button', { name: 'Остановить' }).at(-1)?.click()
    })
    expect(killProcess).toHaveBeenCalledWith({ processId: 'p1', confirmed: true })
    await waitFor(() => expect(screen.getByText('Процесс остановлен.')).toBeTruthy())
  })

  // A row that disappears the moment it is stopped gives no confirmation it
  // ever existed.
  it('keeps the row and moves it to exited', async () => {
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('npm run dev')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Остановить' }).click()
    })
    await act(async () => {
      screen.getAllByRole('button', { name: 'Остановить' }).at(-1)?.click()
    })
    await waitFor(() => expect(screen.getByText(/exited/)).toBeTruthy())
    expect(screen.getByText('npm run dev')).toBeTruthy()
  })

  it('explains a 4044 as another session owning the process', async () => {
    killProcess.mockRejectedValue(new Error('gateway error 4044: no such process: p1'))
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('npm run dev')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'Остановить' }).click()
    })
    await act(async () => {
      screen.getAllByRole('button', { name: 'Остановить' }).at(-1)?.click()
    })
    await waitFor(() => expect(screen.getByText(/другой сессии/)).toBeTruthy())
  })

  it('shows the output tail with ANSI colours resolved, not as escape codes', async () => {
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('npm run dev')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: 'npm run dev' }).click()
    })
    expect(screen.getByText('ready')).toBeTruthy()
    expect(document.body.textContent).not.toContain('[32m')
    expect(screen.getByText(/только хвост вывода/)).toBeTruthy()
  })

  // Task 1.6.B6.4: their poller announces a finished background process as
  // `status.update {kind:"process"}`; the list must not wait out its 4-second
  // timer to notice.
  it('refreshes on status.update {kind:"process"} and ignores other kinds', async () => {
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText('npm run dev')).toBeTruthy())
    expect(listProcesses).toHaveBeenCalledTimes(1)

    await act(async () => {
      emitChatEvent?.({ type: 'status.update', payload: { kind: 'process', text: 'готово' } })
    })
    expect(listProcesses).toHaveBeenCalledTimes(2)

    await act(async () => {
      emitChatEvent?.({ type: 'status.update', payload: { kind: 'compacting', text: 'сжимаю' } })
      emitChatEvent?.({ type: 'message.delta', payload: { text: 'привет' } })
    })
    expect(listProcesses).toHaveBeenCalledTimes(2)
  })

  it('explains an empty list', async () => {
    listProcesses.mockResolvedValue({ own: [], others: [] })
    render(<ProcessesTab active={true} />)
    await waitFor(() => expect(screen.getByText(/Фоновых процессов нет/)).toBeTruthy())
  })
})
