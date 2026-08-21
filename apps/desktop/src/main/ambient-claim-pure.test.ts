// Задача 3.14. Проверяется ровно одно обещание: на одно событие ядра звучит
// одна подсказка, сколько бы окон ни было открыто.

import { describe, expect, it } from 'vitest'

import { claimCue, type ClaimState } from './ambient-claim-pure'

describe('кто проигрывает подсказку, когда окон несколько', () => {
  it('первый выигрывает, остальные молчат', () => {
    const state: ClaimState = new Map()

    expect(claimCue(state, 'turn:42', 1000)).toBe(true)
    expect(claimCue(state, 'turn:42', 1001)).toBe(false)
    expect(claimCue(state, 'turn:42', 1002)).toBe(false)
  })

  it('разные события — разные подсказки', () => {
    const state: ClaimState = new Map()

    expect(claimCue(state, 'turn:42', 1000)).toBe(true)
    expect(claimCue(state, 'turn:43', 1000)).toBe(true)
  })

  it('старые ключи не копятся', () => {
    const state: ClaimState = new Map()

    claimCue(state, 'turn:1', 0)
    claimCue(state, 'turn:2', 1000)
    claimCue(state, 'turn:3', 200_000)

    expect(state.has('turn:1'), 'протухший ключ убран').toBe(false)
    expect(state.has('turn:3')).toBe(true)
  })

  it('мусор вместо ключа не занимает ничего', () => {
    const state: ClaimState = new Map()

    expect(claimCue(state, '', 1000)).toBe(false)
    expect(claimCue(state, undefined, 1000)).toBe(false)
    expect(state.size).toBe(0)
  })
})
