// Task 1.6.A5. These pin a parse of THEIR human-readable line — the fragile
// part of the feature, because there is no structured RPC for goal state.
// Every fixture below is a real output shape of `GoalManager.status_line()`.

import { describe, expect, it } from 'vitest'
import {
  goalBadgeLabel,
  goalControls,
  parseGoalStatus,
  shouldShowGoal,
  type GoalState
} from './goal-pure'

describe('parseGoalStatus', () => {
  it('reads an active goal with its turn budget', () => {
    expect(parseGoalStatus('⊙ Goal (active, 3/20 turns): написать спецификацию')).toEqual({
      status: 'active',
      text: 'написать спецификацию',
      turnsUsed: 3,
      maxTurns: 20,
      raw: '⊙ Goal (active, 3/20 turns): написать спецификацию'
    })
  })

  it('recognises no goal', () => {
    expect(parseGoalStatus('No active goal. Set one with /goal <text>.').status).toBe('none')
    expect(parseGoalStatus('').status).toBe('none')
  })

  it('distinguishes paused, parked and done', () => {
    expect(parseGoalStatus('⏸ Goal (paused, 3/20 turns — user-paused): цель').status).toBe('paused')
    expect(parseGoalStatus('⏳ Goal (parked on pid 42, 3/20 turns): цель').status).toBe('parked')
    expect(parseGoalStatus('✓ Goal done (7/20 turns): цель').status).toBe('done')
  })

  it('keeps a goal that itself contains a colon', () => {
    expect(parseGoalStatus('⊙ Goal (active, 1/20 turns): fix: the parser').text).toBe(
      'fix: the parser'
    )
  })

  it('reports an unrecognised line as unknown instead of guessing', () => {
    const parsed = parseGoalStatus('Goal (something-new, 1/5 turns): цель')
    expect(parsed.status).toBe('unknown')
    expect(parsed.raw).toBe('Goal (something-new, 1/5 turns): цель')
  })

  it('survives a line with no turn budget', () => {
    const parsed = parseGoalStatus('⊙ Goal (active): цель')
    expect(parsed).toMatchObject({ status: 'active', text: 'цель' })
    expect(parsed.turnsUsed).toBeUndefined()
  })
})

describe('goalBadgeLabel', () => {
  it('shows the budget — it is what explains the unrequested turns', () => {
    expect(
      goalBadgeLabel({ status: 'active', text: 'x', turnsUsed: 3, maxTurns: 20, raw: '' })
    ).toBe('Цель активна 3/20')
  })

  it('omits a budget it does not know', () => {
    expect(goalBadgeLabel({ status: 'paused', text: 'x', raw: '' })).toBe('Цель на паузе')
  })

  it('says nothing when there is no goal', () => {
    expect(goalBadgeLabel({ status: 'none', text: '', raw: '' })).toBe('')
  })
})

describe('goalControls', () => {
  const state = (status: GoalState['status']): GoalState => ({ status, text: 'x', raw: '' })

  it('offers pause only while the goal is running', () => {
    expect(goalControls(state('active'))).toEqual({ pause: true, resume: false, clear: true })
    expect(goalControls(state('parked'))).toEqual({ pause: true, resume: false, clear: true })
  })

  it('offers resume only when paused', () => {
    expect(goalControls(state('paused'))).toEqual({ pause: false, resume: true, clear: true })
  })

  it('offers nothing with no goal', () => {
    expect(goalControls(state('none'))).toEqual({ pause: false, resume: false, clear: false })
  })
})

describe('shouldShowGoal', () => {
  it('keeps a finished goal on screen — that is when it explains itself', () => {
    expect(shouldShowGoal({ status: 'done', text: 'x', raw: '' })).toBe(true)
  })

  it('disappears once the goal is cleared', () => {
    expect(shouldShowGoal({ status: 'none', text: '', raw: '' })).toBe(false)
  })
})
