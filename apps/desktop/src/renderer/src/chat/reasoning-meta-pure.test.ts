// Pure unit tests for task 1.5.D1's reasoning meta line — no DOM, no React.

import { describe, expect, it } from 'vitest'
import { durationLabel, reasoningMeta, stepsLabel } from './reasoning-meta-pure'

describe('stepsLabel', () => {
  it('uses the right Russian plural form', () => {
    expect(stepsLabel(1)).toBe('1 шаг')
    expect(stepsLabel(2)).toBe('2 шага')
    expect(stepsLabel(4)).toBe('4 шага')
    expect(stepsLabel(5)).toBe('5 шагов')
    expect(stepsLabel(21)).toBe('21 шаг')
    expect(stepsLabel(22)).toBe('22 шага')
  })

  it('handles the 11-14 exception', () => {
    expect(stepsLabel(11)).toBe('11 шагов')
    expect(stepsLabel(12)).toBe('12 шагов')
    expect(stepsLabel(14)).toBe('14 шагов')
    expect(stepsLabel(111)).toBe('111 шагов')
  })
})

describe('durationLabel', () => {
  it('formats seconds', () => {
    expect(durationLabel(4000)).toBe('4 с')
    expect(durationLabel(59_000)).toBe('59 с')
  })

  it('never shows 0 с for a sub-second span', () => {
    expect(durationLabel(120)).toBe('1 с')
    expect(durationLabel(0)).toBe('1 с')
  })

  it('formats minutes, dropping a zero seconds part', () => {
    expect(durationLabel(65_000)).toBe('1 м 5 с')
    expect(durationLabel(120_000)).toBe('2 м')
  })
})

describe('reasoningMeta', () => {
  it('is undefined when there is nothing honest to show', () => {
    expect(reasoningMeta({ segments: 1 })).toBeUndefined()
  })

  it('shows steps only once there is more than one', () => {
    expect(reasoningMeta({ segments: 1 })).toBeUndefined()
    expect(reasoningMeta({ segments: 3 })).toBe('3 шага')
  })

  it('shows the duration once the block is sealed', () => {
    expect(reasoningMeta({ segments: 1, startedAt: 1000, endedAt: 5000 })).toBe('4 с')
  })

  it('combines steps and duration', () => {
    expect(reasoningMeta({ segments: 3, startedAt: 1000, endedAt: 5000 })).toBe('3 шага · 4 с')
  })

  it('omits the duration while still streaming (no endedAt)', () => {
    expect(reasoningMeta({ segments: 2, startedAt: 1000 })).toBe('2 шага')
  })

  it('omits the duration when the dispatcher supplied no timestamps', () => {
    expect(reasoningMeta({ segments: 2 })).toBe('2 шага')
  })

  it('ignores a backwards span rather than rendering nonsense', () => {
    expect(reasoningMeta({ segments: 1, startedAt: 5000, endedAt: 1000 })).toBeUndefined()
  })
})
