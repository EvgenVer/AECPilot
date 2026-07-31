import { describe, expect, it } from 'vitest'
import { persistUiLanguage, readStoredUiLanguage } from './ui-language'

function fakeStorage(initial?: string) {
  let value = initial
  return {
    getItem: () => value ?? null,
    setItem: (_key: string, next: string) => {
      value = next
    },
    read: () => value
  }
}

describe('ui-language', () => {
  it('defaults to Russian', () => {
    expect(readStoredUiLanguage(fakeStorage())).toBe('ru')
  })

  it('round-trips a stored choice', () => {
    const storage = fakeStorage()
    persistUiLanguage(storage, 'en')
    expect(readStoredUiLanguage(storage)).toBe('en')
  })

  it('reads an unrecognised value as the default', () => {
    expect(readStoredUiLanguage(fakeStorage('klingon'))).toBe('ru')
  })

  // Same hardening as theme.ts: this is read during the first render, so a
  // throwing storage would be a blank window.
  it('survives a storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      }
    }
    expect(readStoredUiLanguage(throwing)).toBe('ru')
    expect(() => persistUiLanguage(throwing, 'en')).not.toThrow()
  })
})
