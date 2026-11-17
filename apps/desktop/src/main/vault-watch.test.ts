// Task T74: the vault watcher on a real disk — a file created outside the app
// is reported once, with its vault-relative path; the index folder is not.

import fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isWatchedVaultPath, startVaultWatch, type VaultWatch } from './vault-watch'

let vault: string
let watch: VaultWatch | null = null

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'aec-t74-'))
  fs.mkdirSync(join(vault, 'workspace', 'notes'), { recursive: true })
  fs.mkdirSync(join(vault, '.aecpilot'))
})

afterEach(() => {
  watch?.close()
  watch = null
  rmSync(vault, { recursive: true, force: true })
})

function collect(): { batches: string[][]; next: () => Promise<string[]> } {
  const batches: string[][] = []
  const waiters: ((paths: string[]) => void)[] = []
  watch = startVaultWatch(
    vault,
    (paths) => {
      batches.push(paths)
      waiters.shift()?.(paths)
    },
    50
  )
  return {
    batches,
    next: () =>
      new Promise<string[]>((resolve, reject) => {
        waiters.push(resolve)
        setTimeout(() => reject(new Error('no change reported')), 3000)
      })
  }
}

describe('startVaultWatch (T74)', () => {
  it('a file written by someone else is reported by its vault path', async () => {
    const { next } = collect()
    const changed = next()
    fs.writeFileSync(join(vault, 'workspace', 'notes', 'T-003.md'), '# агент')
    expect(await changed).toContain('workspace/notes/T-003.md')
  })

  it('a burst of writes to one file arrives as one change', async () => {
    const { batches, next } = collect()
    const changed = next()
    const file = join(vault, 'отчёт.md')
    for (let i = 0; i < 5; i += 1) fs.writeFileSync(file, `версия ${i}`)
    await changed
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(batches.flat().filter((path) => path === 'отчёт.md')).toHaveLength(1)
  })

  it('the index folder is not reported', async () => {
    const { batches } = collect()
    fs.writeFileSync(join(vault, '.aecpilot', 'index.db'), 'x')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(batches.flat()).toEqual([])
  })

  it('a missing folder gives a silent no-op watcher', () => {
    const none = startVaultWatch(join(vault, 'нет'), () => undefined)
    expect(() => none.close()).not.toThrow()
  })
})

describe('isWatchedVaultPath', () => {
  it('keeps project files, drops the index and git', () => {
    expect(isWatchedVaultPath('wiki/ТП-1.md')).toBe(true)
    expect(isWatchedVaultPath('.aecpilot/logs/a.jsonl')).toBe(false)
    expect(isWatchedVaultPath('.git/HEAD')).toBe(false)
    expect(isWatchedVaultPath('')).toBe(false)
  })
})
