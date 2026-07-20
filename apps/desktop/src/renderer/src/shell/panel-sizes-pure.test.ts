// Pure unit tests for task 1.5.9's panel-size clamp + persistence — no DOM,
// no React (same convention as theme.test.ts / explorer-search-pure.test.ts).

import { describe, expect, it, vi } from 'vitest'
import {
  CHAT_DEFAULT,
  CHAT_MAX,
  CHAT_MIN,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clamp,
  persistPanelSizes,
  readStoredPanelSizes
} from './panel-sizes-pure'

/** In-memory Storage stub (only the two methods used). */
function fakeStorage(
  initial?: string
): Pick<Storage, 'getItem' | 'setItem'> & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value
    },
    setItem(_key: string, value: string) {
      this.value = value
    }
  }
}

describe('clamp', () => {
  it('returns the value when in range, the bound when outside', () => {
    expect(clamp(300, 180, 480)).toBe(300)
    expect(clamp(10, 180, 480)).toBe(180)
    expect(clamp(9999, 180, 480)).toBe(480)
    expect(clamp(180, 180, 480)).toBe(180)
    expect(clamp(480, 180, 480)).toBe(480)
  })
})

describe('readStoredPanelSizes', () => {
  it('defaults to the pre-1.5.9 widths when nothing is stored', () => {
    expect(readStoredPanelSizes(fakeStorage())).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      chat: CHAT_DEFAULT
    })
  })

  it('reads back a valid stored value verbatim', () => {
    const stored = JSON.stringify({ sidebar: 300, chat: 420 })
    expect(readStoredPanelSizes(fakeStorage(stored))).toEqual({ sidebar: 300, chat: 420 })
  })

  it('clamps out-of-range stored widths into the current bounds', () => {
    const stored = JSON.stringify({ sidebar: 9999, chat: 10 })
    expect(readStoredPanelSizes(fakeStorage(stored))).toEqual({
      sidebar: SIDEBAR_MAX,
      chat: CHAT_MIN
    })
  })

  it('falls back per-dimension for a missing or non-numeric value', () => {
    const stored = JSON.stringify({ sidebar: 'nope' })
    expect(readStoredPanelSizes(fakeStorage(stored))).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      chat: CHAT_DEFAULT
    })
  })

  it('falls back to defaults on corrupt JSON', () => {
    expect(readStoredPanelSizes(fakeStorage('{not json'))).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      chat: CHAT_DEFAULT
    })
  })

  it('falls back to defaults when getItem throws (storage disabled)', () => {
    const throwing = {
      getItem() {
        throw new Error('SecurityError')
      }
    }
    expect(readStoredPanelSizes(throwing)).toEqual({
      sidebar: SIDEBAR_DEFAULT,
      chat: CHAT_DEFAULT
    })
  })
})

describe('persistPanelSizes', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage()
    persistPanelSizes(storage, { sidebar: 320, chat: 440 })
    expect(readStoredPanelSizes(storage)).toEqual({ sidebar: 320, chat: 440 })
  })

  it('swallows a setItem failure (best-effort persistence)', () => {
    const throwing = {
      setItem: vi.fn(() => {
        throw new Error('QuotaExceeded')
      })
    }
    expect(() => persistPanelSizes(throwing, { sidebar: 320, chat: 440 })).not.toThrow()
    expect(throwing.setItem).toHaveBeenCalledOnce()
  })
})

describe('bounds are self-consistent', () => {
  it('defaults sit within their own [min, max]', () => {
    expect(SIDEBAR_DEFAULT).toBeGreaterThanOrEqual(SIDEBAR_MIN)
    expect(SIDEBAR_DEFAULT).toBeLessThanOrEqual(SIDEBAR_MAX)
    expect(CHAT_DEFAULT).toBeGreaterThanOrEqual(CHAT_MIN)
    expect(CHAT_DEFAULT).toBeLessThanOrEqual(CHAT_MAX)
  })
})
