// Task 1.6.B5.17 — the palette's shell. The behaviours worth pinning are all
// about keys and focus: it opens and closes on the same chord, Escape closes
// it, focus goes back where it came from, and while closed the overlay owns no
// keys at all.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import CommandPalette from './CommandPalette'

const getCommandCatalog = vi.fn()
const listSessions = vi.fn()
const dispatchCommand = vi.fn()
const submitPrompt = vi.fn()
const switchSession = vi.fn()

beforeEach(() => {
  getCommandCatalog.mockResolvedValue({
    pairs: [],
    categories: [{ name: 'Session', pairs: [['/compact', 'Compress the conversation']] }],
    canon: { '/compact': '/compact', '/c': '/compact' },
    warning: ''
  })
  listSessions.mockResolvedValue({ sessions: [{ id: 'stored-1', title: 'Смета' }] })
  dispatchCommand.mockResolvedValue({ type: 'exec', output: 'готово' })
  submitPrompt.mockResolvedValue({ status: 'streaming' })
  switchSession.mockResolvedValue({ sessionId: 'live-2', messages: [{ role: 'user', text: 'x' }] })
  window.aecpilot = {
    getCommandCatalog,
    listSessions,
    dispatchCommand,
    submitPrompt,
    switchSession
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPalette() {
  const onSelectActivity = vi.fn()
  const onSessionLoaded = vi.fn()
  render(<CommandPalette onSelectActivity={onSelectActivity} onSessionLoaded={onSessionLoaded} />)
  return { onSelectActivity, onSessionLoaded }
}

async function openPalette(): Promise<void> {
  await act(async () => {
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  })
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
}

describe('CommandPalette', () => {
  it('opens and closes on the same chord', async () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).toBeNull()
    await openPalette()
    await act(async () => {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', async () => {
    renderPalette()
    await openPalette()
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks the gateway for nothing while it is closed', () => {
    renderPalette()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.keyDown(document, { key: 'a' })
    // No fetch, and no key swallowed: while closed the overlay owns nothing.
    expect(getCommandCatalog).not.toHaveBeenCalled()
  })

  it('returns focus where it came from', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    renderPalette()
    await openPalette()
    // The input took the focus while open…
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Что найти')))
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    // …and gave it back on close.
    await waitFor(() => expect(document.activeElement).toBe(button))
    button.remove()
  })

  it('lists commands, sessions and screens', async () => {
    renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('/compact')).toBeTruthy())
    expect(screen.getByText('Смета')).toBeTruthy()
    expect(screen.getByText('Проводник')).toBeTruthy()
  })

  it('shows their warning instead of dropping it', async () => {
    getCommandCatalog.mockResolvedValue({
      pairs: [],
      categories: [],
      canon: {},
      warning: 'skill discovery unavailable: boom'
    })
    renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText(/skill discovery unavailable/)).toBeTruthy())
  })

  it('runs a command and shows its output', async () => {
    renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('/compact')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('/compact'))
    })
    expect(dispatchCommand).toHaveBeenCalledWith('/compact', '')
    await waitFor(() => expect(screen.getByText('готово')).toBeTruthy())
  })

  it('sends a `send` result through the composer channel', async () => {
    dispatchCommand.mockResolvedValue({ type: 'send', message: 'выучи X' })
    renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('/compact')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('/compact'))
    })
    expect(submitPrompt).toHaveBeenCalledWith('выучи X')
  })

  it('sends nothing at all for an answer shape it does not know', async () => {
    dispatchCommand.mockResolvedValue({ type: 'teleport' })
    renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('/compact')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('/compact'))
    })
    await waitFor(() => expect(screen.getByText(/teleport/)).toBeTruthy())
    expect(submitPrompt).not.toHaveBeenCalled()
  })

  it('switches to a session picked from the palette', async () => {
    const { onSessionLoaded } = renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('Смета')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('Смета'))
    })
    expect(switchSession).toHaveBeenCalledWith('stored-1')
    expect(onSessionLoaded).toHaveBeenCalledWith([{ role: 'user', text: 'x' }])
  })

  it('opens a screen picked from the palette', async () => {
    const { onSelectActivity } = renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('Вики')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByText('Вики'))
    })
    expect(onSelectActivity).toHaveBeenCalledWith('wiki')
  })

  it('still opens when the session list fails', async () => {
    listSessions.mockRejectedValue(new Error('no gateway'))
    renderPalette()
    await openPalette()
    await waitFor(() => expect(screen.getByText('/compact')).toBeTruthy())
  })
})
