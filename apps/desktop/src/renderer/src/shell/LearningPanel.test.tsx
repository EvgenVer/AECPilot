// Tasks 1.6.B3.10/B3.11 — the learning timeline. Source is the REST graph,
// not the `learning.frames` RPC (which raises on Windows); see the note in
// shared/gateway/types.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import LearningPanel from './LearningPanel'

const getLearningGraph = vi.fn()
const getLearningNode = vi.fn()

const march5 = Math.floor(new Date(2026, 2, 5, 12, 0, 0).getTime() / 1000)

beforeEach(() => {
  getLearningGraph.mockResolvedValue({
    nodes: [
      { id: 'dwg-reading', label: 'dwg-reading', kind: 'skill', timestamp: march5 },
      { id: 'memory:AGENTS.md:0', kind: 'memory', timestamp: march5 }
    ],
    memory: [{ source: 'AGENTS.md', body: 'проект использует РД' }]
  })
  getLearningNode.mockResolvedValue({ ok: true, content: '# dwg-reading\nкак читать' })
  window.aecpilot = { getLearningGraph, getLearningNode } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LearningPanel', () => {
  it('groups nodes by day with per-day counts', async () => {
    render(<LearningPanel />)
    await waitFor(() => expect(screen.getByText('2026-03-05')).toBeTruthy())
    expect(screen.getByText('1 скилов · 1 памятей')).toBeTruthy()
  })

  // The graph already carries the memory text.
  it('opens a memory node without touching the gateway', async () => {
    render(<LearningPanel />)
    await waitFor(() => expect(screen.getByText('2026-03-05')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: /memory:AGENTS.md:0/ }).click()
    })
    expect(screen.getByText('проект использует РД')).toBeTruthy()
    expect(getLearningNode).not.toHaveBeenCalled()
  })

  it('fetches a skill node exactly once', async () => {
    render(<LearningPanel />)
    await waitFor(() => expect(screen.getByText('2026-03-05')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: /dwg-reading/ }).click()
    })
    await waitFor(() => expect(screen.getByText(/как читать/)).toBeTruthy())
    // Close and reopen — the body is cached, so still one call.
    await act(async () => {
      screen.getByRole('button', { name: /dwg-reading/ }).click()
    })
    await act(async () => {
      screen.getByRole('button', { name: /dwg-reading/ }).click()
    })
    expect(getLearningNode).toHaveBeenCalledTimes(1)
  })

  it('shows the gateway message when a skill body is unavailable', async () => {
    getLearningNode.mockResolvedValue({ ok: false, message: 'SKILL.md missing' })
    render(<LearningPanel />)
    await waitFor(() => expect(screen.getByText('2026-03-05')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button', { name: /dwg-reading/ }).click()
    })
    await waitFor(() => expect(screen.getByText('SKILL.md missing')).toBeTruthy())
  })

  it('explains an empty graph', async () => {
    getLearningGraph.mockResolvedValue({ nodes: [], memory: [] })
    render(<LearningPanel />)
    await waitFor(() => expect(screen.getByText(/ничему не научился/)).toBeTruthy())
  })

  // Under the e2e override there is no REST surface at all; saying so beats a
  // blank panel.
  it('surfaces the "REST unavailable" error rather than showing nothing', async () => {
    getLearningGraph.mockRejectedValue(
      new Error('REST-интерфейс ядра недоступен: приложение подключено к внешнему шлюзу')
    )
    render(<LearningPanel />)
    await waitFor(() => expect(screen.getByText(/REST-интерфейс ядра недоступен/)).toBeTruthy())
  })
})
