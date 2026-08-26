// Unit tests for task 1.8's source-tree helpers: availability detection (the
// core of BDD "Недоступный источник" — a nonexistent/inaccessible root
// reports `unavailable`, never throws) and tree building on a real tmp-dir
// fixture (nesting, Cyrillic).

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildSourceTree,
  isSourceAvailable,
  PathOutsideSourceError,
  resolveSourceContentRel,
  resolveSourceEntryRel
} from './source-tree'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-source-tree-'))
}

describe('isSourceAvailable', () => {
  it('returns true for an existing, readable directory', async () => {
    const dir = makeTempDir()
    try {
      expect(await isSourceAvailable(dir)).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  // Core of BDD "Недоступный источник": a mock of the "network path became
  // unreachable" scenario — a root that no longer exists must report
  // `false`, never throw.
  it('returns false for a nonexistent root (mocked access error)', async () => {
    const dir = makeTempDir()
    fs.rmSync(dir, { recursive: true, force: true })
    expect(await isSourceAvailable(dir)).toBe(false)
  })

  it('returns false when the root is a file, not a directory', async () => {
    const dir = makeTempDir()
    const filePath = path.join(dir, 'not-a-dir.txt')
    fs.writeFileSync(filePath, 'hi')
    try {
      expect(await isSourceAvailable(filePath)).toBe(false)
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

  it('sorts dirs before files, then alphabetically (Cyrillic included)', async () => {
    const tree = await buildSourceTree(sourcePath)
    expect(tree.map((n) => n.name)).toEqual(['Чертежи', 'sub', 'a-file.txt'])
  })

  it('recurses into subdirectories with posix-style rel paths', async () => {
    const tree = await buildSourceTree(sourcePath)
    const dir = tree.find((n) => n.name === 'Чертежи')
    expect(dir?.type).toBe('dir')
    expect(dir?.children).toEqual([{ name: 'план.dwg', path: 'Чертежи/план.dwg', type: 'file' }])
  })

  it('marks files as type "file" without a children array', async () => {
    const tree = await buildSourceTree(sourcePath)
    const file = tree.find((n) => n.name === 'a-file.txt')
    expect(file).toEqual({ name: 'a-file.txt', path: 'a-file.txt', type: 'file' })
  })
})

// Unit tests for task 1.5.5's `resolveSourceEntryRel` — same adversarial
// contract as vault-fs.test.ts's `resolveVaultRel`/`resolveVaultEntryRel`
// (`..`, absolute paths, `\\?\`/`\\.\` device prefixes, control characters,
// drive-relative `C:foo`, the "C:\a\bc must not look nested inside C:\a\b"
// boundary case), plus the one place its contract differs: unlike a vault
// entry op, an empty rel legitimately resolves to the source's own root.
const SOURCE_ROOT = 'C:\\shares\\object-x'

describe('resolveSourceEntryRel — empty/undefined rel resolves to the source root', () => {
  it('resolves undefined to the (path-resolved) source root', async () => {
    expect(await resolveSourceEntryRel(SOURCE_ROOT, undefined)).toBe(path.resolve(SOURCE_ROOT))
  })

  it('resolves an empty string to the source root', async () => {
    expect(await resolveSourceEntryRel(SOURCE_ROOT, '')).toBe(path.resolve(SOURCE_ROOT))
  })

  it.each(['.', './', './.', './/'])('resolves rel %s to the source root too', async (rel) => {
    expect(await resolveSourceEntryRel(SOURCE_ROOT, rel)).toBe(path.resolve(SOURCE_ROOT))
  })
})

describe('resolveSourceEntryRel — traversal attempts', () => {
  it('rejects a ".." component', async () => {
    await expect(resolveSourceEntryRel(SOURCE_ROOT, '..\\outside')).rejects.toThrow(
      PathOutsideSourceError
    )
  })

  it('rejects a ".." component mixed into a deeper relative path', async () => {
    await expect(resolveSourceEntryRel(SOURCE_ROOT, 'a\\..\\..\\b')).rejects.toThrow(
      PathOutsideSourceError
    )
  })

  it('rejects an all-dots component ("...")', async () => {
    await expect(resolveSourceEntryRel(SOURCE_ROOT, '...')).rejects.toThrow(PathOutsideSourceError)
  })

  it('rejects an absolute path', async () => {
    await expect(resolveSourceEntryRel(SOURCE_ROOT, 'C:\\Windows\\System32')).rejects.toThrow(
      PathOutsideSourceError
    )
  })

  it('rejects a \\\\?\\ device/extended-length prefix', async () => {
    await expect(
      resolveSourceEntryRel(SOURCE_ROOT, '\\\\?\\C:\\shares\\object-x\\a')
    ).rejects.toThrow(PathOutsideSourceError)
  })

  it('rejects a \\\\.\\ device prefix', async () => {
    await expect(
      resolveSourceEntryRel(SOURCE_ROOT, '\\\\.\\C:\\shares\\object-x\\a')
    ).rejects.toThrow(PathOutsideSourceError)
  })

  it('rejects a path containing an embedded control character', async () => {
    const rel = 'a' + String.fromCharCode(0) + 'evil'
    await expect(resolveSourceEntryRel(SOURCE_ROOT, rel)).rejects.toThrow(PathOutsideSourceError)
  })

  it('rejects a drive-relative component ("C:foo")', async () => {
    await expect(resolveSourceEntryRel(SOURCE_ROOT, 'C:foo')).rejects.toThrow(
      PathOutsideSourceError
    )
  })
})

describe('resolveSourceEntryRel — boundary safety (component, not string-prefix, based)', () => {
  it('never lets a sibling with a shared string prefix resolve outside the root', async () => {
    const root = 'C:\\a\\b'
    const resolved = await resolveSourceEntryRel(root, 'sub')
    expect(resolved.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)).toBe(
      true
    )
    expect(resolved).not.toBe('C:\\a\\bc')
  })
})

describe('resolveSourceEntryRel — accepts a valid nested relative path', () => {
  it('resolves a normal relative path, forward or backward slashes', async () => {
    expect(await resolveSourceEntryRel(SOURCE_ROOT, 'a\\b.pdf')).toBe(
      path.resolve(SOURCE_ROOT, 'a', 'b.pdf')
    )
    expect(await resolveSourceEntryRel(SOURCE_ROOT, 'a/b.pdf')).toBe(
      path.resolve(SOURCE_ROOT, 'a', 'b.pdf')
    )
  })
})

// Same junction-based real-path containment contract as vault-fs.test.ts's
// symlink/junction tests (see that file's comment for why a junction, not a
// true symlink, is used).
describe('resolveSourceEntryRel — symlink/junction escape (real-path containment)', () => {
  let sourceRoot: string
  let outsideDir: string

  beforeEach(() => {
    sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-source-tree-root-'))
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-source-tree-outside-'))
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'top secret')
  })

  afterEach(() => {
    fs.rmSync(sourceRoot, { recursive: true, force: true })
    fs.rmSync(outsideDir, { recursive: true, force: true })
  })

  function makeEscapingJunction(ctx: { skip: () => void }): string | undefined {
    const link = path.join(sourceRoot, 'escape-link')
    try {
      fs.symlinkSync(outsideDir, link, 'junction')
    } catch {
      ctx.skip()
      return undefined
    }
    return link
  }

  it('rejects reaching an entry through an escaping junction component', async (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    await expect(resolveSourceEntryRel(sourceRoot, 'escape-link/secret.txt')).rejects.toThrow(
      PathOutsideSourceError
    )
  })

  it('still allows targeting the junction LEAF itself ("Показать в проводнике" the link, not its target)', async (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    expect(await resolveSourceEntryRel(sourceRoot, 'escape-link')).toBe(link)
  })

  // Находка D-44, сторона источника. Просмотрщик читает файл источника ПО
  // ссылке, поэтому лист, законно пропускаемый для «Показать в проводнике»,
  // для чтения обязан быть отказом.
  it('resolveSourceContentRel отказывает на том же листе, который пропускает resolveSourceEntryRel', async (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    expect(await resolveSourceEntryRel(sourceRoot, 'escape-link')).toBe(link)
    await expect(resolveSourceContentRel(sourceRoot, 'escape-link')).rejects.toThrow(
      PathOutsideSourceError
    )
  })

  it('resolveSourceContentRel пропускает обычный файл внутри источника', async () => {
    fs.writeFileSync(path.join(sourceRoot, 'чертёж.pdf'), 'x')
    expect(await resolveSourceContentRel(sourceRoot, 'чертёж.pdf')).toBe(
      path.join(sourceRoot, 'чертёж.pdf')
    )
  })

  it('корень источника документом не считается', async () => {
    await expect(resolveSourceContentRel(sourceRoot, '.')).rejects.toThrow(PathOutsideSourceError)
  })
})

// Task 4D-8. Measured before the change: `fs.statSync` against a dead UNC path
// (`\10.255.255.1\share`) waited 42,2 s and let the timer fire ONCE — the whole
// main process frozen for three quarters of a minute. `fs.promises.stat` against
// an equally dead path waited the same 42,2 s and let it fire 681 times. The
// wait is the network's and cannot be argued with; whether the app is alive
// during it is ours.
//
// A behavioral test of that costs 42 seconds per run, so the guard is static:
// a source root is routinely a network share, and no filesystem call in this
// module may be the blocking kind again.
describe('source-tree: no blocking filesystem calls (task 4D-8)', () => {
  it('uses no *Sync filesystem call', () => {
    const source = fs.readFileSync(path.join(__dirname, 'source-tree.ts'), 'utf8')
    const offenders = [...source.matchAll(/\bfs\.\w+Sync\b/g)].map((m) => m[0])

    expect(offenders).toEqual([])
  })
})
