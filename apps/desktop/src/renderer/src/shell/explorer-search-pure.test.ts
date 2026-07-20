// Pure unit tests for task 1.5.6's explorer search/filter logic — no DOM, no
// React, no react-arborist (same convention as source-status-pure.test.ts).

import { describe, expect, it } from 'vitest'
import {
  matchesSearchQuery,
  splitBySearchQuery,
  subtreeMatchesSearchQuery,
  type NamedNode
} from './explorer-search-pure'

describe('matchesSearchQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesSearchQuery('Основания.md', '')).toBe(true)
  })

  it('matches everything for a whitespace-only query', () => {
    expect(matchesSearchQuery('Основания.md', '   ')).toBe(true)
  })

  it('matches a substring anywhere in the name', () => {
    expect(matchesSearchQuery('Основания.md', 'осн')).toBe(true)
    expect(matchesSearchQuery('Основания.md', 'я.md')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesSearchQuery('Основания.md', 'ОСН')).toBe(true)
    expect(matchesSearchQuery('report.PDF', 'pdf')).toBe(true)
  })

  it('is false when the query does not occur in the name', () => {
    expect(matchesSearchQuery('Основания.md', 'xyz')).toBe(false)
  })

  it('trims surrounding whitespace off the query before matching', () => {
    expect(matchesSearchQuery('Основания.md', '  осн  ')).toBe(true)
  })
})

describe('subtreeMatchesSearchQuery', () => {
  const leaf: NamedNode = { name: 'Основания.md' }
  const folder: NamedNode = {
    name: 'wiki',
    children: [leaf, { name: 'Обзор проекта.md' }]
  }

  it('matches when the node itself matches (leaf, no children)', () => {
    expect(subtreeMatchesSearchQuery(leaf, 'осн')).toBe(true)
  })

  it('matches a folder whose own name does not match but a child does', () => {
    expect(subtreeMatchesSearchQuery(folder, 'осн')).toBe(true)
  })

  it('matches a folder by its own name even if no child matches', () => {
    expect(subtreeMatchesSearchQuery(folder, 'wiki')).toBe(true)
  })

  it('is false when neither the node nor any descendant matches', () => {
    expect(subtreeMatchesSearchQuery(folder, 'xyz')).toBe(false)
  })

  it('recurses through more than one level of nesting', () => {
    const nested: NamedNode = {
      name: 'workspace',
      children: [{ name: 'drafts', children: [{ name: 'осадки-ПК4.md' }] }]
    }
    expect(subtreeMatchesSearchQuery(nested, 'осадки')).toBe(true)
    expect(subtreeMatchesSearchQuery(nested, 'zzz')).toBe(false)
  })

  it('matches everything for an empty query, regardless of nesting', () => {
    expect(subtreeMatchesSearchQuery(folder, '')).toBe(true)
  })
})

describe('splitBySearchQuery', () => {
  it('returns the whole name in `pre` for an empty query', () => {
    expect(splitBySearchQuery('Основания.md', '')).toEqual({
      pre: 'Основания.md',
      match: '',
      post: ''
    })
  })

  it('returns the whole name in `pre` when the query does not occur', () => {
    expect(splitBySearchQuery('Основания.md', 'xyz')).toEqual({
      pre: 'Основания.md',
      match: '',
      post: ''
    })
  })

  it('splits pre/match/post around the first occurrence', () => {
    expect(splitBySearchQuery('Основания.md', 'осн')).toEqual({
      pre: '',
      match: 'Осн',
      post: 'ования.md'
    })
  })

  it('matches case-insensitively but preserves the original casing in `match`', () => {
    expect(splitBySearchQuery('Report.PDF', 'pdf')).toEqual({
      pre: 'Report.',
      match: 'PDF',
      post: ''
    })
  })

  it('splits at the first occurrence when the query repeats in the name', () => {
    expect(splitBySearchQuery('aaa', 'a')).toEqual({ pre: '', match: 'a', post: 'aa' })
  })
})
