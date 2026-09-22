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

  // D-99. Ключ звука — сессия: следующий ход в ней через несколько секунд —
  // новое событие, и звучать он обязан.
  it('второй ход в той же сессии через две секунды снова звучит', () => {
    const state: ClaimState = new Map()

    expect(claimCue(state, 'sound:e2e-7', 0)).toBe(true)
    expect(claimCue(state, 'sound:e2e-7', 300), 'второе окно, тот же ход').toBe(false)
    expect(claimCue(state, 'sound:e2e-7', 2000), 'следующий ход').toBe(true)
  })

  it('чтение вслух держит ключ долго: опоздавшее окно не читает второй раз', () => {
    const state: ClaimState = new Map()

    expect(claimCue(state, 'speak:msg-1', 0)).toBe(true)
    expect(claimCue(state, 'speak:msg-1', 30_000)).toBe(false)
    expect(claimCue(state, 'speak:msg-1', 11 * 60_000)).toBe(true)
  })

  it('мусор вместо ключа не занимает ничего', () => {
    const state: ClaimState = new Map()

    expect(claimCue(state, '', 1000)).toBe(false)
    expect(claimCue(state, undefined, 1000)).toBe(false)
    expect(state.size).toBe(0)
  })
})
