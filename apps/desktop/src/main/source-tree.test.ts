// Unit tests for task 1.8's source-tree helpers: availability detection (the
// core of BDD "Недоступный источник" — a nonexistent/inaccessible root
// reports `unavailable`, never throws) and tree building on a real tmp-dir
// fixture (nesting, Cyrillic).

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildSourceTree, isSourceAvailable } from './source-tree'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-source-tree-'))
}

describe('isSourceAvailable', () => {
  it('returns true for an existing, readable directory', () => {
    const dir = makeTempDir()
    try {
      expect(isSourceAvailable(dir)).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // Core of BDD "Недоступный источник": a mock of the "network path became
  // unreachable" scenario — a root that no longer exists must report
  // `false`, never throw.
  it('returns false for a nonexistent root (mocked access error)', () => {
    const dir = makeTempDir()
    fs.rmSync(dir, { recursive: true, force: true })
    expect(isSourceAvailable(dir)).toBe(false)
  })

  it('returns false when the root is a file, not a directory', () => {
    const dir = makeTempDir()
    const filePath = path.join(dir, 'not-a-dir.txt')
    fs.writeFileSync(filePath, 'hi')
    try {
      expect(isSourceAvailable(filePath)).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('buildSourceTree', () => {
  let sourcePath: string

  beforeEach(() => {
    sourcePath = makeTempDir()
    fs.mkdirSync(path.join(sourcePath, 'Чертежи'))
    fs.writeFileSync(path.join(sourcePath, 'Чертежи', 'план.dwg'), 'binary')
    fs.mkdirSync(path.join(sourcePath, 'sub'))
    fs.writeFileSync(path.join(sourcePath, 'a-file.txt'), 'hi')
  })

  afterEach(() => {
    fs.rmSync(sourcePath, { recursive: true, force: true })
  })

  it('sorts dirs before files, then alphabetically (Cyrillic included)', () => {
    const tree = buildSourceTree(sourcePath)
    expect(tree.map((n) => n.name)).toEqual(['Чертежи', 'sub', 'a-file.txt'])
  })

  it('recurses into subdirectories with posix-style rel paths', () => {
    const tree = buildSourceTree(sourcePath)
    const dir = tree.find((n) => n.name === 'Чертежи')
    expect(dir?.type).toBe('dir')
    expect(dir?.children).toEqual([{ name: 'план.dwg', path: 'Чертежи/план.dwg', type: 'file' }])
  })

  it('marks files as type "file" without a children array', () => {
    const tree = buildSourceTree(sourcePath)
    const file = tree.find((n) => n.name === 'a-file.txt')
    expect(file).toEqual({ name: 'a-file.txt', path: 'a-file.txt', type: 'file' })
  })
})
