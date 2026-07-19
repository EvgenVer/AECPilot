// Unit tests for task 1.5.10's theme module — no DOM/localStorage, plain
// fakes for the injected storage/root (same no-DOM convention as
// scan-notification-pure.test.ts/chat-state.test.ts).

import { describe, expect, it } from 'vitest'
import { applyTheme, persistTheme, readStoredTheme, type ThemeRoot } from './theme'

function fakeStorage(initial: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> {
  const store = { ...initial }
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value
    }
  }
}

/** Simulates disabled/opaque-origin storage, e.g. a `SecurityError` thrown
 * by both `getItem` and `setItem` (see readStoredTheme/persistTheme's doc
 * comments). */
function throwingStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: () => {
      throw new Error('storage disabled')
    },
    setItem: () => {
      throw new Error('storage disabled')
    }
  }
}

describe('readStoredTheme', () => {
  it('defaults to light when nothing is stored', () => {
    expect(readStoredTheme(fakeStorage())).toBe('light')
  })

  it('reads back a stored dark theme', () => {
    expect(readStoredTheme(fakeStorage({ 'aecpilot.theme': 'dark' }))).toBe('dark')
  })

  it('reads back a stored light theme', () => {
    expect(readStoredTheme(fakeStorage({ 'aecpilot.theme': 'light' }))).toBe('light')
  })

  it('falls back to light for an unrecognized stored value', () => {
    expect(readStoredTheme(fakeStorage({ 'aecpilot.theme': 'blue' }))).toBe('light')
  })

  it('falls back to light when storage.getItem throws (e.g. disabled storage)', () => {
    expect(readStoredTheme(throwingStorage())).toBe('light')
  })
})

describe('persistTheme', () => {
  it('writes the theme under the same key readStoredTheme reads back', () => {
    const storage = fakeStorage()
    persistTheme(storage, 'dark')
    expect(readStoredTheme(storage)).toBe('dark')
  })

  it('overwrites a previously stored value', () => {
    const storage = fakeStorage({ 'aecpilot.theme': 'dark' })
    persistTheme(storage, 'light')
    expect(readStoredTheme(storage)).toBe('light')
  })

  it('does not throw when storage.setItem throws (best-effort persistence)', () => {
    expect(() => persistTheme(throwingStorage(), 'dark')).not.toThrow()
  })
})

describe('applyTheme', () => {
  it('sets data-theme to dark', () => {
    const root: ThemeRoot = { dataset: {} }
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
  })

  it('sets data-theme to light, overwriting a previous dark value', () => {
    const root: ThemeRoot = { dataset: { theme: 'dark' } }
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
  })
})
