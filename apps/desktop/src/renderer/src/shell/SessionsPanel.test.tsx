// Tasks 1.6.B5.3–B5.10 — the sessions section. What is worth pinning here is
// what the component must NOT do: filter by project itself (main already did,
// and a second copy would drift), delete a session the gateway is holding open,
// offer branching on an empty session, or lose a row when the gateway refuses.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import SessionsPanel from './SessionsPanel'
import type { GatewayEvent } from '../../../shared/gateway/types'

const listSessions = vi.fn()
const listActiveSessions = vi.fn()
const switchSession = vi.fn()
const activateSession = vi.fn()
const deleteSession = vi.fn()
const renameSession = vi.fn()
const branchSession = vi.fn()
const onChatEvent = vi.fn()
let emitEvent: ((event: GatewayEvent) => void) | undefined

beforeEach(() => {
  listSessions.mockResolvedValue({
    sessions: [
      {
        id: 'stored-1',
        title: 'Смета',
        preview: 'посчитай бетон',
        message_count: 3,
        started_at: 1_780_000_000,
        source: 'aecpilot-desktop'
      },
      {
        id: 'stored-2',
        title: '',
        preview: 'ГОСТ на арматуру',
        message_count: 1,
        started_at: 1_780_100_000,
        source: 'aecpilot-desktop'
      }
    ]
  })
  listActiveSessions.mockResolvedValue({
    sessions: [
      {
        id: 'live-1',
        session_key: 'stored-1',
        title: 'Смета',
        preview: 'посчитай бетон',
        model: 'gpt-5',
        status: 'idle',
        current: true,
        message_count: 3,
        started_at: 1_780_000_000,
        last_active: 1_780_000_100
      }
    ]
  })
  switchSession.mockResolvedValue({ sessionId: 'live-9', messages: [{ role: 'user', text: 'да' }] })
  activateSession.mockResolvedValue({ sessionId: 'live-1', messages: [] })
  deleteSession.mockResolvedValue({ deleted: 'stored-2' })
  renameSession.mockResolvedValue({ title: 'Новое имя', pending: false })
  branchSession.mockResolvedValue({ sessionId: 'live-2', title: 'Смета (branch)' })
  onChatEvent.mockImplementation((cb: (event: GatewayEvent) => void) => {
    emitEvent = cb
    return () => {
      emitEvent = undefined
    }
  })
  window.aecpilot = {
    listSessions,
    listActiveSessions,
    switchSession,
    activateSession,
    deleteSession,
    renameSession,
    branchSession,
    onChatEvent
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(streaming = false) {
  const onSessionLoaded = vi.fn()
  render(<SessionsPanel streaming={streaming} onSessionLoaded={onSessionLoaded} />)
  return { onSessionLoaded }
}

describe('SessionsPanel', () => {
  it('shows exactly what main returned and does no project filtering of its own', async () => {
    renderPanel()
    // "Смета" is on screen twice on purpose — once as a live session, once as
    // a stored one; they answer different questions.
    await waitFor(() => expect(screen.getAllByText('Смета')).toHaveLength(2))
    // The second row has no title — the preview stands in for it.
    expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy()
    // A session of another project never reaches this component: main's
    // `sessions:list` filters through `sessionIdsForProject` (task 1.20),
    // because MEASURED: session.list rows carry no cwd.
    expect(listSessions).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('чужая сессия')).toBeNull()
  })

  it('switches a session and redraws the transcript from the resumed messages', async () => {
    const { onSessionLoaded } = renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('ГОСТ на арматуру'))
    })
    expect(switchSession).toHaveBeenCalledWith('stored-2')
    expect(onSessionLoaded).toHaveBeenCalledWith([{ role: 'user', text: 'да' }])
  })

  it('refuses to offer deletion for a session the gateway is holding open', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    const deleteButtons = screen.getAllByText('Удалить')
    // stored-1 is live (session_key in the active list) → its button is off;
    // stored-2 is not → its button works.
    expect((deleteButtons[0] as HTMLButtonElement).disabled).toBe(true)
    expect((deleteButtons[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the row when the gateway refuses the delete with 4023', async () => {
    deleteSession.mockRejectedValue(new Error('4023: cannot delete an active session'))
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getAllByText('Удалить')[1] as HTMLElement)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('alertdialog').querySelector('button') as HTMLElement)
    })
    await waitFor(() => expect(screen.getByText(/сейчас открыта в ядре/)).toBeTruthy())
    // A row that vanishes on a refusal would claim the session is gone.
    expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy()
  })

  it('does not send the delete before the confirmation is given', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getAllByText('Удалить')[1] as HTMLElement)
    })
    expect(deleteSession).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('alertdialog').querySelector('button') as HTMLElement)
    })
    expect(deleteSession).toHaveBeenCalledWith({ storedId: 'stored-2', confirmed: true })
  })

  it('explains what the search covers instead of saying nothing was found', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Поиск по сессиям'), {
        target: { value: 'бетон в подвале' }
      })
    })
    expect(screen.getByText(/по тексту переписки ядро не умеет/)).toBeTruthy()
  })

  it('renames a session and reports a deferred name as success, not failure', async () => {
    renameSession.mockResolvedValue({ title: 'Черновик', pending: true })
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getAllByText('Переименовать')[0] as HTMLElement)
    })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Новое имя сессии Смета'), {
        target: { value: 'Черновик' }
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Сохранить'))
    })
    expect(renameSession).toHaveBeenCalledWith({ storedId: 'stored-1', title: 'Черновик' })
    await waitFor(() => expect(screen.getByText(/применится после первого сообщения/)).toBeTruthy())
  })

  it('renames the row the session.title event names, and only that row', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      // The envelope carries the LIVE sid, the payload the STORED key — a
      // handler that matched the envelope would rename nothing.
      emitEvent?.({
        type: 'session.title',
        session_id: 'live-1',
        payload: { session_id: 'stored-2', title: 'Про арматуру' }
      } as GatewayEvent)
    })
    await waitFor(() => expect(screen.getByText('Про арматуру')).toBeTruthy())
    expect(screen.getAllByText('Смета')).toHaveLength(2)
  })

  it('marks the current live session and offers no switch to itself', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText(/текущая/)).toBeTruthy())
    const liveRow = screen.getByText(/текущая/).closest('li') as HTMLElement
    const button = liveRow.querySelector('button') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('activates another live session without closing the current one', async () => {
    listActiveSessions.mockResolvedValue({
      sessions: [
        {
          id: 'live-1',
          session_key: 'stored-1',
          title: 'Смета',
          preview: '',
          model: 'gpt-5',
          status: 'idle',
          current: true,
          message_count: 3,
          started_at: 1,
          last_active: 1
        },
        {
          id: 'live-2',
          session_key: 'stored-2',
          title: 'Ветка',
          preview: '',
          model: 'gpt-5',
          status: 'streaming',
          current: false,
          message_count: 1,
          started_at: 1,
          last_active: 1
        }
      ]
    })
    const { onSessionLoaded } = renderPanel()
    await waitFor(() => expect(screen.getByText('Ветка')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('Ветка'))
    })
    expect(activateSession).toHaveBeenCalledWith('live-2')
    expect(onSessionLoaded).toHaveBeenCalledWith([])
    // Both are still listed: their handler deliberately does not close the
    // previously focused session.
    await waitFor(() => expect(screen.getByText('Ветка')).toBeTruthy())
    expect(screen.getAllByText('Смета').length).toBeGreaterThan(0)
  })

  it('branches the current session and keeps the previous one in the list', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('ГОСТ на арматуру')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('Ветвить'))
    })
    expect(branchSession).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/Прежняя сессия осталась открытой/)).toBeTruthy())
  })

  it('disables branching on a session with no turns, instead of failing with 4008', async () => {
    listActiveSessions.mockResolvedValue({
      sessions: [
        {
          id: 'live-1',
          session_key: 'stored-1',
          title: 'Пустая',
          preview: '',
          model: '',
          status: 'idle',
          current: true,
          message_count: 0,
          started_at: 1,
          last_active: 1
        }
      ]
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('Пустая')).toBeTruthy())
    expect((screen.getByText('Ветвить') as HTMLButtonElement).disabled).toBe(true)
  })

  it('still lists sessions when the live list is unavailable', async () => {
    listActiveSessions.mockRejectedValue(new Error('no gateway'))
    renderPanel()
    // The stored list is the point of the screen; the live one is extra.
    await waitFor(() => expect(screen.getByText('Смета')).toBeTruthy())
    expect(screen.getAllByText('Смета')).toHaveLength(1)
    expect(screen.queryByText('Открыты сейчас')).toBeNull()
  })
})
