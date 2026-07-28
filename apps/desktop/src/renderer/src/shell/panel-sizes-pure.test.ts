// Pure unit tests for task 1.5.9's panel-size clamp + persistence — no DOM,
// no React (same convention as theme.test.ts / explorer-search-pure.test.ts).

import { describe, expect, it, vi } from 'vitest'
import {
  BOTTOM_DEFAULT,
  BOTTOM_MAX,
  CHAT_DEFAULT,
  CHAT_MAX,
  CHAT_MIN,
  PANEL_BOUNDS,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SOURCES_DEFAULT,
  SOURCES_MIN,
  clamp,
  persistPanelSizes,
  readStoredPanelSizes,
  type PanelSizes
} from './panel-sizes-pure'

/** Every dimension at its default — the shape `readStoredPanelSizes` falls
 * back to, spelled out once. */
const DEFAULTS: PanelSizes = {
  sidebar: SIDEBAR_DEFAULT,
  chat: CHAT_DEFAULT,
  sources: SOURCES_DEFAULT,
  bottom: BOTTOM_DEFAULT
}

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
  it('defaults to the pre-resize sizes when nothing is stored', () => {
    expect(readStoredPanelSizes(fakeStorage())).toEqual(DEFAULTS)
  })

  it('reads back a valid stored value verbatim', () => {
    const stored = JSON.stringify({ sidebar: 300, chat: 420, sources: 220, bottom: 260 })
    expect(readStoredPanelSizes(fakeStorage(stored))).toEqual({
      sidebar: 300,
      chat: 420,
      sources: 220,
      bottom: 260
    })
  })

  it('clamps out-of-range stored sizes into the current bounds', () => {
    const stored = JSON.stringify({ sidebar: 9999, chat: 10, sources: 1, bottom: 9999 })
    expect(readStoredPanelSizes(fakeStorage(stored))).toEqual({
      sidebar: SIDEBAR_MAX,
      chat: CHAT_MIN,
      sources: SOURCES_MIN,
      bottom: BOTTOM_MAX
    })
  })

  it('falls back per-dimension for a missing or non-numeric value', () => {
    const stored = JSON.stringify({ sidebar: 'nope' })
    expect(readStoredPanelSizes(fakeStorage(stored))).toEqual(DEFAULTS)
  })

  it('keeps the stored widths of a record written before the vertical axes existed', () => {
    // Task 1.6.L1/L2 added `sources`/`bottom` to a key that 1.5.9 already
    // wrote: an upgrade must keep the user's widths, not reset the record.
    const preBatchL = JSON.stringify({ sidebar: 300, chat: 420 })
    expect(readStoredPanelSizes(fakeStorage(preBatchL))).toEqual({
      sidebar: 300,
      chat: 420,
      sources: SOURCES_DEFAULT,
      bottom: BOTTOM_DEFAULT
    })
  })

  it('falls back to defaults on corrupt JSON', () => {
    expect(readStoredPanelSizes(fakeStorage('{not json'))).toEqual(DEFAULTS)
  })

  it('falls back to defaults when getItem throws (storage disabled)', () => {
    const throwing = {
      getItem() {
        throw new Error('SecurityError')
      }
    }
    expect(readStoredPanelSizes(throwing)).toEqual(DEFAULTS)
  })
})

describe('persistPanelSizes', () => {
  it('round-trips every dimension through storage', () => {
    const storage = fakeStorage()
    const sizes: PanelSizes = { sidebar: 320, chat: 440, sources: 210, bottom: 300 }
    persistPanelSizes(storage, sizes)
    expect(readStoredPanelSizes(storage)).toEqual(sizes)
  })

  it('persists a reset back to the default, so it survives a restart', () => {
    // Task 1.6.L3: double-clicking a separator writes PANEL_BOUNDS[key].default
    // through the same commit path as a drag.
    const storage = fakeStorage()
    persistPanelSizes(storage, { sidebar: 320, chat: 440, sources: 210, bottom: 300 })
    persistPanelSizes(storage, {
      ...readStoredPanelSizes(storage),
      sources: PANEL_BOUNDS.sources.default
    })
    expect(readStoredPanelSizes(storage)).toEqual({
      sidebar: 320,
      chat: 440,
      sources: SOURCES_DEFAULT,
      bottom: 300
    })
  })

  it('swallows a setItem failure (best-effort persistence)', () => {
    const throwing = {
      setItem: vi.fn(() => {
        throw new Error('QuotaExceeded')
      })
    }
    expect(() =>
      persistPanelSizes(throwing, { sidebar: 320, chat: 440, sources: 210, bottom: 300 })
    ).not.toThrow()
    expect(throwing.setItem).toHaveBeenCalledOnce()
  })
})

describe('bounds are self-consistent', () => {
  it('every dimension has min < max with its default inside', () => {
    for (const [key, bound] of Object.entries(PANEL_BOUNDS)) {
      expect(bound.min, key).toBeLessThan(bound.max)
      expect(bound.default, key).toBeGreaterThanOrEqual(bound.min)
      expect(bound.default, key).toBeLessThanOrEqual(bound.max)
    }
  })

  it('covers every dimension the shell stores', () => {
    expect(Object.keys(PANEL_BOUNDS).sort()).toEqual(Object.keys(DEFAULTS).sort())
  })

  it('agrees with the named constants', () => {
    expect(PANEL_BOUNDS.sidebar).toEqual({
      min: SIDEBAR_MIN,
      max: SIDEBAR_MAX,
      default: SIDEBAR_DEFAULT
    })
    expect(PANEL_BOUNDS.chat).toEqual({ min: CHAT_MIN, max: CHAT_MAX, default: CHAT_DEFAULT })
  })
})
