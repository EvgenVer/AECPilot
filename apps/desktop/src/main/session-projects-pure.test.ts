// Unit tests for task 1.20's chat-session <-> project tagging/filtering
// logic.

import { describe, expect, it } from 'vitest'
import {
  parseSessionProjectsJson,
  sessionIdsForProject,
  tagSession,
  untaggedSessionIds
} from './session-projects-pure'

const VAULT_A = 'C:/vaults/a'
const VAULT_B = 'C:/vaults/b'

describe('parseSessionProjectsJson', () => {
  it('returns {} for a missing/empty file', () => {
    expect(parseSessionProjectsJson('')).toEqual({})
  })

  it('returns {} for malformed JSON', () => {
    expect(parseSessionProjectsJson('{not json')).toEqual({})
  })

  it('returns {} when the parsed value is an array, not an object', () => {
    expect(parseSessionProjectsJson('[1,2,3]')).toEqual({})
  })

  it('returns {} when the parsed value is null', () => {
    expect(parseSessionProjectsJson('null')).toEqual({})
  })

  it('drops individual entries whose value is not a string, keeping valid ones', () => {
    const raw = JSON.stringify({ good: VAULT_A, bad: 42, alsoBad: null })
    expect(parseSessionProjectsJson(raw)).toEqual({ good: VAULT_A })
  })

  it('passes through a valid mapping unchanged', () => {
    const raw = JSON.stringify({ s1: VAULT_A, s2: VAULT_B })
    expect(parseSessionProjectsJson(raw)).toEqual({ s1: VAULT_A, s2: VAULT_B })
  })
})

describe('tagSession', () => {
  it('adds a new tag to an empty map', () => {
    expect(tagSession({}, 's1', VAULT_A)).toEqual({ s1: VAULT_A })
  })

  it('overwrites a previous tag for the same session key', () => {
    expect(tagSession({ s1: VAULT_A }, 's1', VAULT_B)).toEqual({ s1: VAULT_B })
  })

  it('leaves other entries untouched', () => {
    expect(tagSession({ s1: VAULT_A, s2: VAULT_B }, 's3', VAULT_A)).toEqual({
      s1: VAULT_A,
      s2: VAULT_B,
      s3: VAULT_A
    })
  })

  // review fix, nit 4: neither an empty session key nor an empty vaultPath
  // is a value this code path should ever actually receive (session.create's
  // stored_session_id and a vaultPath both come from validated sources
  // upstream) — these document that a stray empty string is stored like any
  // other string key/value rather than silently dropped or throwing.
  it('accepts an empty-string session key as an ordinary key', () => {
    expect(tagSession({}, '', VAULT_A)).toEqual({ '': VAULT_A })
  })

  it('accepts an empty-string vaultPath as an ordinary value', () => {
    expect(tagSession({}, 's1', '')).toEqual({ s1: '' })
  })
})

describe('sessionIdsForProject', () => {
  it('returns an empty set when nothing is tagged to the vault', () => {
    expect(sessionIdsForProject({ s1: VAULT_B }, VAULT_A)).toEqual(new Set())
  })

  it('returns only the ids tagged to the given vault', () => {
    const map = { s1: VAULT_A, s2: VAULT_B, s3: VAULT_A }
    expect(sessionIdsForProject(map, VAULT_A)).toEqual(new Set(['s1', 's3']))
  })

  it('returns an empty set for an empty map', () => {
    expect(sessionIdsForProject({}, VAULT_A)).toEqual(new Set())
  })
})

describe('untaggedSessionIds', () => {
  // review fix, minor 1 + nit 4: the "no project open" branch of
  // sessions:list — only ids never tagged to ANY project pass through.
  it('drops ids tagged to any project, keeping untagged ones', () => {
    const map = { s1: VAULT_A, s2: VAULT_B }
    expect(untaggedSessionIds(map, ['s1', 's2', 's3'])).toEqual(['s3'])
  })

  it('returns every id unchanged when the map is empty', () => {
    expect(untaggedSessionIds({}, ['s1', 's2'])).toEqual(['s1', 's2'])
  })

  it('returns [] when every id is tagged', () => {
    const map = { s1: VAULT_A, s2: VAULT_B }
    expect(untaggedSessionIds(map, ['s1', 's2'])).toEqual([])
  })

  it('returns [] for an empty ids list', () => {
    expect(untaggedSessionIds({ s1: VAULT_A }, [])).toEqual([])
  })
})
