import { expect, test } from 'vitest'
import { CHECKPOINT_MARKERS, resolveCheckpointScope } from './checkpoint-scope-pure'

const HOME = 'C:\\Users\\Evgen'

/** Windows-style parent, stopping at the drive root — same termination rule as
 * python's `check != check.parent`. */
function parentOf(dir: string): string {
  const trimmed = dir.replace(/\\+$/, '')
  const idx = trimmed.lastIndexOf('\\')
  if (idx <= 2) return trimmed.slice(0, 3) // 'C:\'
  return trimmed.slice(0, idx)
}

function scope(vault: string, dirsWithMarker: string[]): ReturnType<typeof resolveCheckpointScope> {
  const set = new Set(dirsWithMarker.map((d) => d.toLowerCase()))
  return resolveCheckpointScope(vault, HOME, (dir) => set.has(dir.toLowerCase()), parentOf)
}

test('a marker in the vault root means the list addresses the same directory', () => {
  expect(scope('C:\\Users\\Evgen\\Projects\\vault', ['C:\\Users\\Evgen\\Projects\\vault'])).toEqual(
    {
      kind: 'vault'
    }
  )
})

test('the nearest marker above the vault sends snapshots to that ancestor', () => {
  expect(scope('C:\\Users\\Evgen\\Projects\\vault', ['C:\\Users\\Evgen\\Projects'])).toEqual({
    kind: 'ancestor',
    dir: 'C:\\Users\\Evgen\\Projects'
  })
})

test("a marker in the user's home is the silent-refusal case, not just a wrong id", () => {
  expect(scope('C:\\Users\\Evgen\\Projects\\vault', [HOME])).toEqual({
    kind: 'blocked',
    dir: HOME
  })
})

test('no marker anywhere up to the drive root', () => {
  expect(scope('C:\\Users\\Evgen\\Projects\\vault', [])).toEqual({ kind: 'unmarked' })
})

test('the drive root itself is never tested — python exits the loop before it', () => {
  expect(scope('C:\\Users\\Evgen\\Projects\\vault', ['C:\\'])).toEqual({ kind: 'unmarked' })
})

test('the nearest marker wins over a further one', () => {
  expect(
    scope('C:\\Users\\Evgen\\Projects\\vault\\wiki', [
      'C:\\Users\\Evgen\\Projects\\vault',
      'C:\\Users\\Evgen\\Projects'
    ])
  ).toEqual({ kind: 'ancestor', dir: 'C:\\Users\\Evgen\\Projects\\vault' })
})

test('drive-letter case does not change the verdict', () => {
  expect(scope('c:\\users\\evgen\\projects\\vault', ['C:\\Users\\Evgen\\Projects\\vault'])).toEqual(
    {
      kind: 'vault'
    }
  )
})

test('the marker list is the nine hermes looks for', () => {
  expect([...CHECKPOINT_MARKERS]).toEqual([
    '.git',
    'pyproject.toml',
    'package.json',
    'Cargo.toml',
    'go.mod',
    'Makefile',
    'pom.xml',
    '.hg',
    'Gemfile'
  ])
})
