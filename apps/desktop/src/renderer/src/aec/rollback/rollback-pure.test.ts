// Task 1.6.C2. The awkward cases the screen is actually for: an empty list
// that is not really empty, a truncated patch, and a diff answer the gateway
// cannot disambiguate.

import { describe, expect, it } from 'vitest'
import {
  DIFF_CHAR_LIMIT,
  describeRollback,
  explainScope,
  formatCheckpointTime,
  isDiffMaybeTruncated,
  parseDiffFiles,
  parseDiffLines,
  shortHash
} from './rollback-pure'
import type { RollbackListing } from '../../../../shared/ipc'

const CHECKPOINT = { hash: 'a'.repeat(40), timestamp: '2026-07-30T04:21:00+03:00' }

function listing(over: Partial<RollbackListing> = {}): RollbackListing {
  return { enabled: true, checkpoints: [], scope: { kind: 'vault' }, ...over }
}

describe('describeRollback', () => {
  it('says "off" rather than "empty" when checkpoints are disabled', () => {
    expect(describeRollback(listing({ enabled: false })).kind).toBe('disabled')
  })

  it('an empty list with a marker in the vault root really is empty', () => {
    expect(describeRollback(listing()).kind).toBe('empty')
  })

  it('an empty list with the marker ABOVE the vault is not empty — it is misfiled', () => {
    const view = describeRollback(listing({ scope: { kind: 'ancestor', dir: 'D:/my program' } }))
    expect(view.kind).toBe('unavailable')
  })

  it('the home-directory guard is reported as unavailable too — nothing is ever recorded', () => {
    expect(
      describeRollback(listing({ scope: { kind: 'blocked', dir: 'C:/Users/Ivan' } })).kind
    ).toBe('unavailable')
  })

  it('an unmarked vault is unavailable, not empty', () => {
    expect(describeRollback(listing({ scope: { kind: 'unmarked' } })).kind).toBe('unavailable')
  })

  it('a non-empty list still carries the warning when the scope is off', () => {
    const view = describeRollback(
      listing({ checkpoints: [CHECKPOINT], scope: { kind: 'unmarked' } })
    )
    expect(view).toMatchObject({ kind: 'list', warning: { kind: 'unmarked' } })
  })

  it('a healthy non-empty list carries no warning', () => {
    const view = describeRollback(listing({ checkpoints: [CHECKPOINT] }))
    expect(view).toMatchObject({ kind: 'list', warning: null })
  })
})

describe('explainScope', () => {
  it('names the directory the snapshots actually went to', () => {
    expect(explainScope({ kind: 'ancestor', dir: 'D:/my program' }).detail).toContain(
      'D:/my program'
    )
  })

  it('says outright that the home-directory case records nothing at all', () => {
    expect(explainScope({ kind: 'blocked', dir: 'C:/Users/Ivan' }).title).toContain('не создаются')
  })

  it('admits it cannot tell when no project is open', () => {
    expect(explainScope({ kind: 'unknown' }).title).toContain('не удалось')
  })
})

describe('formatCheckpointTime', () => {
  it("reads git's own offset as local time instead of converting it", () => {
    expect(formatCheckpointTime('2026-07-30T04:21:00+03:00')).toBe('30.07.2026, 04:21')
  })

  it('passes anything unrecognised through rather than printing Invalid Date', () => {
    expect(formatCheckpointTime('позавчера')).toBe('позавчера')
  })
})

describe('shortHash', () => {
  it('abbreviates the way hermes does', () => {
    expect(shortHash('abcdef1234567890')).toBe('abcdef12')
  })
})

describe('isDiffMaybeTruncated', () => {
  it('flags a patch sitting exactly on their 4000-character slice', () => {
    expect(isDiffMaybeTruncated('x'.repeat(DIFF_CHAR_LIMIT))).toBe(true)
    expect(isDiffMaybeTruncated('x'.repeat(DIFF_CHAR_LIMIT - 1))).toBe(false)
  })
})

describe('parseDiffLines', () => {
  it('does not paint the file headers as added and removed lines', () => {
    const lines = parseDiffLines('--- a/x.md\n+++ b/x.md\n@@ -1 +1 @@\n-старое\n+новое')
    expect(lines.map((l) => l.kind)).toEqual(['meta', 'meta', 'hunk', 'del', 'add'])
  })

  it('treats an empty patch as no lines, not one blank line', () => {
    expect(parseDiffLines('')).toEqual([])
  })
})

describe('parseDiffFiles', () => {
  it('takes the change sign from the header block, not from the path', () => {
    const diff = [
      'diff --git a/added.md b/added.md',
      'new file mode 100644',
      'diff --git a/gone.md b/gone.md',
      'deleted file mode 100644',
      'diff --git a/plain.md b/plain.md',
      'index 111..222 100644'
    ].join('\n')
    expect(parseDiffFiles(diff)).toEqual([
      { path: 'added.md', change: 'added', binary: false },
      { path: 'gone.md', change: 'deleted', binary: false },
      { path: 'plain.md', change: 'modified', binary: false }
    ])
  })

  it('marks a binary file — there is no line content to show for it', () => {
    const diff = 'diff --git a/p.png b/p.png\nBinary files a/p.png and b/p.png differ'
    expect(parseDiffFiles(diff)[0]).toMatchObject({ path: 'p.png', binary: true })
  })

  it('reports a rename under its new name — that is what restore takes', () => {
    const diff = 'diff --git a/old.md b/new.md\nsimilarity index 95%\nrename to new.md'
    expect(parseDiffFiles(diff)[0]).toMatchObject({ path: 'new.md', change: 'renamed' })
  })

  it('finds nothing in an empty patch', () => {
    expect(parseDiffFiles('')).toEqual([])
  })
})
