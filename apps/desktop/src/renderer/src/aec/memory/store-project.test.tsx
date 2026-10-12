// D-205: число фактов на строке «Память» боковой панели — у ОТКРЫТОГО проекта.
// Факты у каждого проекта свои, и после смены проекта строка не должна
// показывать число прежнего до первого хода или открытия страницы.

import { describe, expect, it, vi } from 'vitest'

import { $memoryFactsCount, followProjectForFactsCount } from './store'

describe('строка «Память» и смена проекта (D-205)', () => {
  it('при открытии другого проекта число перечитывается сразу', async () => {
    let opened: (() => void) | undefined
    let facts = [{ channel: '', created_at: '', id: 'f-1', text: 'Резерв мощности 20%.' }]
    Object.defineProperty(window, 'aecpilot', {
      configurable: true,
      value: {
        onProjectOpened: (cb: () => void) => {
          opened = cb
          return () => undefined
        },
        readMemoryFacts: async () => ({ facts, ok: true })
      }
    })

    followProjectForFactsCount()
    $memoryFactsCount.set(16)
    facts = []
    opened?.()

    await vi.waitFor(() => expect($memoryFactsCount.get()).toBe(0))
  })
})
