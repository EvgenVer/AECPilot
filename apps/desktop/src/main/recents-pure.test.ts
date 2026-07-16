// Unit tests for task 1.3's recent-projects merge/parse logic.

import { describe, expect, it } from 'vitest'
import { addRecent, parseRecentsJson, type RecentProject } from './recents-pure'

const A: RecentProject = { name: 'A', vaultPath: 'C:/vaults/a', openedAt: '2026-07-16T10:00:00Z' }
const B: RecentProject = { name: 'B', vaultPath: 'C:/vaults/b', openedAt: '2026-07-16T11:00:00Z' }

describe('parseRecentsJson', () => {
  it('returns [] for a missing/empty file', () => {
    expect(parseRecentsJson('')).toEqual([])
  })

  it('returns [] for malformed JSON', () => {
    expect(parseRecentsJson('{not json')).toEqual([])
  })

  it('returns [] when the parsed value is not an array', () => {
    expect(parseRecentsJson('{"a":1}')).toEqual([])
  })

  it('drops individual entries with the wrong shape, keeping valid ones', () => {
    const raw = JSON.stringify([A, { name: 'bad' }, 42, null, B])
    expect(parseRecentsJson(raw)).toEqual([A, B])
  })

  it('passes through a valid array unchanged', () => {
    const raw = JSON.stringify([A, B])
    expect(parseRecentsJson(raw)).toEqual([A, B])
  })
})

describe('addRecent', () => {
  it('adds a new entry to the front of an empty list', () => {
    expect(addRecent([], A)).toEqual([A])
  })

  it('puts the new entry first, keeping the rest in order (MRU)', () => {
    expect(addRecent([A, B], { ...B, name: 'B2' })).toEqual([{ ...B, name: 'B2' }, A])
  })

  it('de-duplicates by vaultPath, case-insensitively', () => {
    const upper: RecentProject = { ...A, vaultPath: A.vaultPath.toUpperCase(), name: 'A-renamed' }
    expect(addRecent([A, B], upper)).toEqual([upper, B])
  })

  it('de-duplicates across slash direction and a trailing separator', () => {
    // A.vaultPath is 'C:/vaults/a' — these should all collapse to the same key.
    const backslash: RecentProject = { ...A, vaultPath: 'C:\\vaults\\a', name: 'A-backslash' }
    expect(addRecent([A, B], backslash)).toEqual([backslash, B])

    const trailingSlash: RecentProject = { ...A, vaultPath: 'C:/vaults/a/', name: 'A-trailing' }
    expect(addRecent([A, B], trailingSlash)).toEqual([trailingSlash, B])

    const trailingBackslash: RecentProject = {
      ...A,
      vaultPath: 'C:\\vaults\\a\\',
      name: 'A-trailing-backslash'
    }
    expect(addRecent([A, B], trailingBackslash)).toEqual([trailingBackslash, B])
  })

  it('caps the result at 10 entries, dropping the oldest', () => {
    const list: RecentProject[] = Array.from({ length: 10 }, (_, i) => ({
      name: `P${i}`,
      vaultPath: `C:/vaults/p${i}`,
      openedAt: `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`
    }))
    const next = addRecent(list, { name: 'New', vaultPath: 'C:/vaults/new', openedAt: 'z' })
    expect(next).toHaveLength(10)
    expect(next[0].name).toBe('New')
    expect(next.some((p) => p.name === 'P9')).toBe(false)
  })
})
