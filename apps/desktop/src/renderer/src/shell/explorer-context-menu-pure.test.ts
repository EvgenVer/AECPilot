// Pure unit tests for task 1.5.7's per-node context menu logic — no DOM, no
// React, no react-arborist (same convention as explorer-search-pure.test.ts).

import { describe, expect, it } from 'vitest'
import { contextMenuSections } from './explorer-context-menu-pure'

describe('contextMenuSections', () => {
  it('gives a vault folder a read section and a write section, delete last', () => {
    const sections = contextMenuSections('vault-dir')
    expect(sections).toHaveLength(2)
    expect(sections[0].map((item) => item.action)).toEqual(['show-in-explorer', 'copy-path'])
    expect(sections[1].map((item) => item.action)).toEqual([
      'rename',
      'create-file',
      'create-dir',
      'delete'
    ])
  })

  it('gives a vault file the write section without create actions', () => {
    const sections = contextMenuSections('vault-file')
    expect(sections).toHaveLength(2)
    expect(sections[1].map((item) => item.action)).toEqual(['rename', 'delete'])
  })

  it('gives a source node only the read section — no write actions at all', () => {
    const sections = contextMenuSections('source')
    expect(sections).toHaveLength(1)
    expect(sections[0].map((item) => item.action)).toEqual(['show-in-explorer', 'copy-path'])
  })

  it('marks "Удалить" as the only dangerous action, for both writable kinds', () => {
    for (const kind of ['vault-dir', 'vault-file'] as const) {
      const dangerous = contextMenuSections(kind)
        .flat()
        .filter((item) => item.danger)
      expect(dangerous.map((item) => item.action)).toEqual(['delete'])
    }
  })

  it('the read section is identical across all three kinds (same handlers)', () => {
    const dirRead = contextMenuSections('vault-dir')[0]
    const fileRead = contextMenuSections('vault-file')[0]
    const sourceRead = contextMenuSections('source')[0]
    expect(dirRead).toEqual(fileRead)
    expect(dirRead).toEqual(sourceRead)
  })
})
