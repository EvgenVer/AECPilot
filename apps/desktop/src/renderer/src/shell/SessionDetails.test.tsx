// Tasks 1.6.B5.11–B5.15 — session details. Two of the three actions here are
// refused by the gateway mid-turn (4009), and the test that matters is that
// they are never sent then, rather than that the error is displayed nicely.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import SessionDetails from './SessionDetails'
import { THOUSANDS_SEPARATOR as NB } from './session-details-pure'

const getSessionUsage = vi.fn()
const getContextBreakdown = vi.fn()
const compressSession = vi.fn()
const undoTurn = vi.fn()

beforeEach(() => {
  getSessionUsage.mockResolvedValue({
    input: 1200,
    output: 340,
    reasoning: 90,
    calls: 7,
    context_used: 12_400,
    context_max: 128_000
  })
  getContextBreakdown.mockResolvedValue({
    categories: [
      { id: 'system_prompt', label: 'System prompt', tokens: 300, color: 'var(--ui-accent)' },
      { id: 'conversation', label: 'Conversation', tokens: 700, color: 'var(--ui-accent)' }
    ]
  })
  compressSession.mockResolvedValue({
    status: 'compressed',
    beforeMessages: 40,
    afterMessages: 2,
    beforeTokens: 90_000,
    afterTokens: 21_000,
    messages: [
      { role: 'user', text: 'привет' },
      { role: 'assistant', text: 'сводка' }
    ]
  })
  undoTurn.mockResolvedValue({ removed: 3 })
  window.aecpilot = {
    getSessionUsage,
    getContextBreakdown,
    compressSession,
    undoTurn
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function open(streaming = false) {
  const onSessionLoaded = vi.fn()
  const onTurnUndone = vi.fn()
  render(
    <SessionDetails
      streaming={streaming}
      onSessionLoaded={onSessionLoaded}
      onTurnUndone={onTurnUndone}
    />
  )
  await act(async () => {
    fireEvent.click(screen.getByText('Детали сессии'))
  })
  return { onSessionLoaded, onTurnUndone }
}

describe('SessionDetails', () => {
  it('asks for nothing until it is opened', () => {
    render(<SessionDetails streaming={false} onSessionLoaded={() => {}} onTurnUndone={() => {}} />)
    expect(getSessionUsage).not.toHaveBeenCalled()
  })

  // Read through the DOM rather than getByText: testing-library normalizes
  // whitespace, and the whole point of the no-break separator is that it is a
  // different character from a space.
  function usageValues(): (string | null)[] {
    return Array.from(document.querySelectorAll('.usage-grid__row dd')).map((el) => el.textContent)
  }

  it('shows the four usage numbers and the context fill', async () => {
    await open()
    await waitFor(() => expect(usageValues()).toHaveLength(4))
    expect(usageValues()).toEqual([`1${NB}200`, '340', '90', '7'])
    expect(document.body.textContent).toContain(`12${NB}400 из 128${NB}000 (10 %)`)
  })

  it('says the fill is unknown rather than showing 0 %', async () => {
    getSessionUsage.mockResolvedValue({ input: 5 })
    await open()
    await waitFor(() => expect(screen.getByText(/неизвестно/)).toBeTruthy())
  })

  it('hides the credits block when the gateway sent none', async () => {
    await open()
    await waitFor(() => expect(usageValues()).toHaveLength(4))
    expect(document.querySelector('.usage-credits')).toBeNull()
  })

  it('explains an empty breakdown instead of showing an empty list', async () => {
    getContextBreakdown.mockResolvedValue({ categories: [] })
    await open()
    await waitFor(() => expect(screen.getByText(/Агент этой сессии ещё не собран/)).toBeTruthy())
  })

  it('compresses and redraws the transcript from the history main re-read', async () => {
    const { onSessionLoaded } = await open()
    await waitFor(() => expect(screen.getByText('Сжать контекст')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('Сжать контекст'))
    })
    // Exactly `after_messages` entries — main takes them from session.history,
    // not from compress's own raw `messages`.
    expect(onSessionLoaded).toHaveBeenCalledWith([
      { role: 'user', text: 'привет' },
      { role: 'assistant', text: 'сводка' }
    ])
    expect(onSessionLoaded.mock.calls[0][0]).toHaveLength(2)
    await waitFor(() => expect(screen.getByText(/40 → 2/)).toBeTruthy())
  })

  it('disables compression and undo mid-turn instead of surfacing 4009', async () => {
    await open(true)
    await waitFor(() => expect(screen.getByText('Сжать контекст')).toBeTruthy())
    expect((screen.getByText('Сжать контекст') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Отменить последний ход') as HTMLButtonElement).disabled).toBe(true)
    expect(compressSession).not.toHaveBeenCalled()
    expect(undoTurn).not.toHaveBeenCalled()
  })

  it('undoes a turn and reports how many entries the core dropped', async () => {
    const { onTurnUndone } = await open()
    await waitFor(() => expect(screen.getByText('Отменить последний ход')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('Отменить последний ход'))
    })
    expect(onTurnUndone).toHaveBeenCalledWith(3)
    await waitFor(() => expect(screen.getByText(/3 последних записей/)).toBeTruthy())
  })

  it('states the limitation the core actually has, next to the button', async () => {
    await open()
    await waitFor(() =>
      expect(screen.getByText(/при переоткрытии сессии ход вернётся/)).toBeTruthy()
    )
  })
})
