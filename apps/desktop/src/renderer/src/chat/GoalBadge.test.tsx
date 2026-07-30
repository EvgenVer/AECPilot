// Task 1.6.A5 — the badge itself. The pure parse is covered in
// goal-pure.test.ts; what matters here is that the badge appears from the
// gateway's answer, offers the right control, and goes away when the goal is
// cleared.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import GoalBadge from './GoalBadge'

const dispatchGoal = vi.fn()

beforeEach(() => {
  dispatchGoal.mockResolvedValue({ output: '' })
  window.aecpilot = {
    dispatchGoal,
    onChatEvent: () => () => {}
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GoalBadge', () => {
  it('stays off screen when there is no goal', async () => {
    dispatchGoal.mockResolvedValue({ output: 'No active goal. Set one with /goal <text>.' })
    render(<GoalBadge />)
    await waitFor(() => expect(dispatchGoal).toHaveBeenCalledWith('status'))
    expect(screen.queryByText(/Цель/)).toBeNull()
  })

  it('shows the goal and its turn budget once one is set', async () => {
    dispatchGoal.mockResolvedValue({
      output: '⊙ Goal (active, 3/20 turns): написать спецификацию'
    })
    render(<GoalBadge />)
    expect(await screen.findByText('Цель активна 3/20')).toBeTruthy()
    expect(screen.getByText('написать спецификацию')).toBeTruthy()
  })

  it('offers pause on a running goal and resume on a paused one', async () => {
    dispatchGoal.mockResolvedValue({ output: '⊙ Goal (active, 1/20 turns): цель' })
    render(<GoalBadge />)
    expect(await screen.findByRole('button', { name: 'Пауза' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Возобновить' })).toBeNull()

    cleanup()
    dispatchGoal.mockResolvedValue({ output: '⏸ Goal (paused, 1/20 turns): цель' })
    render(<GoalBadge />)
    expect(await screen.findByRole('button', { name: 'Возобновить' })).toBeTruthy()
  })

  it('clearing the goal removes the badge', async () => {
    dispatchGoal.mockResolvedValue({ output: '⊙ Goal (active, 1/20 turns): цель' })
    render(<GoalBadge />)
    const clear = await screen.findByRole('button', { name: 'Снять цель' })

    dispatchGoal.mockResolvedValue({ output: 'No active goal. Set one with /goal <text>.' })
    await act(async () => {
      clear.click()
    })
    await waitFor(() => expect(screen.queryByText(/Цель/)).toBeNull())
    expect(dispatchGoal).toHaveBeenCalledWith('clear')
  })

  it('re-reads the goal when a turn ends — that is when their judge speaks', async () => {
    let emit: ((event: { type: string }) => void) | undefined
    window.aecpilot = {
      dispatchGoal,
      onChatEvent: (cb: (event: { type: string }) => void) => {
        emit = cb
        return () => {}
      }
    } as unknown as typeof window.aecpilot
    dispatchGoal.mockResolvedValue({ output: 'No active goal.' })
    render(<GoalBadge />)
    await waitFor(() => expect(dispatchGoal).toHaveBeenCalledTimes(1))

    dispatchGoal.mockResolvedValue({ output: '⊙ Goal (active, 2/20 turns): цель' })
    await act(async () => {
      emit?.({ type: 'message.complete' })
    })
    expect(await screen.findByText('Цель активна 2/20')).toBeTruthy()
  })
})
