// Unit tests for task 1.6's vault-fs helpers: anti-traversal path resolution
// (TS analog of mcp/aec_sources's resolve_in_root, contract: same adversarial
// cases as tasks 1.7/1.10 — `..`, absolute paths, `\\?\`/`\\.\` device
// prefixes, control characters, the "C:\a\bc must not look nested inside
// C:\a\b" boundary case), entry-name validation, and tree building/sorting
// on a real tmp-dir fixture.

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildVaultTree,
  createDirEntry,
  createFileEntry,
  PathOutsideVaultError,
  renameEntry,
  resolveVaultContentRel,
  resolveVaultEntryRel,
  writeVaultFile,
  resolveVaultRel,
  validateEntryName
} from './vault-fs'

const VAULT = 'C:\\projects\\object-x'

describe('resolveVaultRel — empty/undefined rel resolves to the vault root', () => {
  it('resolves undefined to the (path-resolved) vault root', () => {
    expect(resolveVaultRel(VAULT, undefined)).toBe(path.resolve(VAULT))
  })

  it('resolves an empty string to the vault root', () => {
    expect(resolveVaultRel(VAULT, '')).toBe(path.resolve(VAULT))
  })
})

describe('resolveVaultRel — traversal attempts', () => {
  it('rejects a ".." component', () => {
    expect(() => resolveVaultRel(VAULT, '..\\outside')).toThrow(PathOutsideVaultError)
  })

  it('rejects a ".." component mixed into a deeper relative path', () => {
    expect(() => resolveVaultRel(VAULT, 'wiki\\..\\..\\outside')).toThrow(PathOutsideVaultError)
  })

  it('rejects an all-dots component ("...")', () => {
    expect(() => resolveVaultRel(VAULT, '...')).toThrow(PathOutsideVaultError)
  })

  it('rejects an absolute path', () => {
    expect(() => resolveVaultRel(VAULT, 'C:\\Windows\\System32')).toThrow(PathOutsideVaultError)
  })

  it('rejects a \\\\?\\ device/extended-length prefix', () => {
    expect(() => resolveVaultRel(VAULT, '\\\\?\\C:\\projects\\object-x\\wiki')).toThrow(
      PathOutsideVaultError
    )
  })

  it('rejects a \\\\.\\ device prefix', () => {
    expect(() => resolveVaultRel(VAULT, '\\\\.\\C:\\projects\\object-x\\wiki')).toThrow(
      PathOutsideVaultError
    )
  })

  it('rejects a path containing an embedded control character', () => {
    const rel = 'wiki' + String.fromCharCode(0) + 'evil'
    expect(() => resolveVaultRel(VAULT, rel)).toThrow(PathOutsideVaultError)
  })

  it('rejects a drive-relative component ("C:foo")', () => {
    expect(() => resolveVaultRel(VAULT, 'C:foo')).toThrow(PathOutsideVaultError)
  })

  it('rejects any rel whose first segment is .aecpilot', () => {
    expect(() => resolveVaultRel(VAULT, '.aecpilot\\project.json')).toThrow(PathOutsideVaultError)
  })

  it('rejects .aecpilot case-insensitively', () => {
    expect(() => resolveVaultRel(VAULT, '.AECPILOT\\project.json')).toThrow(PathOutsideVaultError)
  })
})

describe('resolveVaultRel — boundary safety (component, not string-prefix, based)', () => {
  it('never lets a sibling with a shared string prefix resolve outside the root', () => {
    // 'C:\a\b' as root: a legitimate rel path can only ever join onto that
    // root, so it can never produce 'C:\a\bc' — this documents (and locks
    // in) that guarantee, mirroring the same boundary case validated for
    // source-validation.ts's two-full-paths comparison.
    const root = 'C:\\a\\b'
    const resolved = resolveVaultRel(root, 'sub')
    expect(resolved.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep)).toBe(
      true
    )
    expect(resolved).not.toBe('C:\\a\\bc')
  })
})

describe('resolveVaultRel — accepts a valid nested relative path', () => {
  it('resolves a normal relative path, forward or backward slashes', () => {
    expect(resolveVaultRel(VAULT, 'wiki\\notes.md')).toBe(path.resolve(VAULT, 'wiki', 'notes.md'))
    expect(resolveVaultRel(VAULT, 'wiki/notes.md')).toBe(path.resolve(VAULT, 'wiki', 'notes.md'))
  })
})

describe('resolveVaultEntryRel — requires a non-empty rel', () => {
  it('rejects an empty rel', () => {
    expect(() => resolveVaultEntryRel(VAULT, '')).toThrow(PathOutsideVaultError)
  })

  it('rejects a whitespace-only rel', () => {
    expect(() => resolveVaultEntryRel(VAULT, '   ')).toThrow(PathOutsideVaultError)
  })

  it('accepts a valid non-empty rel', () => {
    expect(resolveVaultEntryRel(VAULT, 'wiki')).toBe(path.resolve(VAULT, 'wiki'))
  })
})

// Fix-iteration 1 (review BLOCKER): '.', './', './.', './/' all sanitize down
// to zero path segments, i.e. lexically "the vault root itself" — an entry
// operation (rename/delete/show-in-explorer) must never resolve to that,
// since it means "act on the whole vault". `resolveVaultRel` (used for a
// create's *parent directory*, where "the root" is a perfectly legal parent)
// intentionally still allows all of these.
describe('resolveVaultEntryRel — rejects any rel that resolves to the vault root itself', () => {
  it.each(['.', './', './.', './/'])('rejects rel %s', (rel) => {
    expect(() => resolveVaultEntryRel(VAULT, rel)).toThrow(PathOutsideVaultError)
  })

  it('resolveVaultRel still allows the same rels — a create parent may legally be the root', () => {
    for (const rel of ['.', './', './.', './/']) {
      expect(resolveVaultRel(VAULT, rel)).toBe(path.resolve(VAULT))
    }
  })
})

// Fix-iteration 1 (review major): the containment check up to here was
// purely lexical (`path.resolve`/`path.relative` on the *given* segments) —
// a symlink/junction *inside* the vault pointing *outside* it slips straight
// through, since the lexical join never "sees" that the directory component
// isn't really where it looks like it is. Junctions (not true symlinks) are
// used here deliberately: unlike `os.symlink`'s Windows counterpart, an NTFS
// junction (`fs.symlinkSync(target, path, 'junction')`) never needs Developer
// Mode/admin privileges, so this doesn't need the try/catch-skip fallback of
// tasks 1.7/1.10/1.11's true-symlink tests — kept anyway as a defensive
// fallback in case some sandboxed CI environment still refuses it.
describe('resolveVaultRel / resolveVaultEntryRel — symlink/junction escape (real-path containment)', () => {
  let vaultPath: string
  let outsideDir: string

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-vault-fs-'))
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-vault-fs-outside-'))
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'top secret')
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
    fs.rmSync(outsideDir, { recursive: true, force: true })
  })

  function makeEscapingJunction(ctx: { skip: () => void }): string | undefined {
    const link = path.join(vaultPath, 'escape-link')
    try {
      fs.symlinkSync(outsideDir, link, 'junction')
    } catch {
      ctx.skip()
      return undefined
    }
    return link
  }

  it('rejects resolveVaultRel (create parent) writing through an escaping junction', (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    expect(() => resolveVaultRel(vaultPath, 'escape-link')).toThrow(PathOutsideVaultError)
  })

  it('rejects resolveVaultEntryRel reaching an entry through an escaping junction component', (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    expect(() => resolveVaultEntryRel(vaultPath, 'escape-link/secret.txt')).toThrow(
      PathOutsideVaultError
    )
  })

  it('still allows resolveVaultEntryRel to target the junction LEAF itself (rename/delete the link, not its target)', (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    expect(resolveVaultEntryRel(vaultPath, 'escape-link')).toBe(link)
  })
})

// Находка D-44. Тот же побег, но резолвером СОДЕРЖИМОГО: чтение и запись идут
// ПО ссылке, поэтому симлинк-лист, который резолвер сущности выше намеренно
// пропускает, здесь обязан быть отказом. Блок стоит вплотную к предыдущему не
// случайно: фикстура одна, вердикты противоположные — ровно то различие, что
// было потеряно, когда разрешающий резолвер подключили к чтению и записи.
describe('resolveVaultContentRel / writeVaultFile — симлинк-лист наружу (D-44)', () => {
  let vaultPath: string
  let outsideDir: string

  beforeEach(() => {
    vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-vault-content-'))
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-vault-content-outside-'))
    fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'top secret')
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
    fs.rmSync(outsideDir, { recursive: true, force: true })
  })

  /** Junction: прав не требует, поэтому пропуска здесь почти никогда не будет. */
  function makeEscapingJunction(ctx: { skip: () => void }): string | undefined {
    const link = path.join(vaultPath, 'escape-link')
    try {
      fs.symlinkSync(outsideDir, link, 'junction')
    } catch {
      ctx.skip()
      return undefined
    }
    return link
  }

  /** Симлинк на ФАЙЛ — тот самый случай из жизни («отчёт.md» → чужой файл).
   * На Windows требует Developer Mode, поэтому с пропуском: junction выше
   * проходит по тому же коду и держит проверку, даже когда этот пропущен. */
  function makeEscapingFileSymlink(ctx: { skip: () => void }): string | undefined {
    const link = path.join(vaultPath, 'отчёт.md')
    try {
      fs.symlinkSync(path.join(outsideDir, 'secret.txt'), link, 'file')
    } catch {
      ctx.skip()
      return undefined
    }
    return link
  }

  it('отказывает, когда лист сам — junction наружу (там, где резолвер сущности пропускает)', (ctx) => {
    const link = makeEscapingJunction(ctx)
    if (!link) return
    // Соседний вердикт для сравнения: для переименования и удаления тот же
    // путь ПРОПУСКАЕТСЯ, и это верно — операция идёт над ссылкой.
    expect(resolveVaultEntryRel(vaultPath, 'escape-link')).toBe(link)
    expect(() => resolveVaultContentRel(vaultPath, 'escape-link')).toThrow(PathOutsideVaultError)
  })

  it('отказывает читать симлинк-файл, ведущий наружу', (ctx) => {
    if (!makeEscapingFileSymlink(ctx)) return
    expect(() => resolveVaultContentRel(vaultPath, 'отчёт.md')).toThrow(PathOutsideVaultError)
  })

  it('writeVaultFile не пишет сквозь симлинк-файл наружу', (ctx) => {
    if (!makeEscapingFileSymlink(ctx)) return
    expect(() => writeVaultFile(vaultPath, 'отчёт.md', 'подменено')).toThrow(PathOutsideVaultError)
    expect(fs.readFileSync(path.join(outsideDir, 'secret.txt'), 'utf8')).toBe('top secret')
  })

  // Тот же отказ на junction — без прав и без пропуска. Нужен потому, что тест
  // выше на этой машине пропускается, и правка записи осталась бы без единой
  // работающей проверки. Резолвер срабатывает раньше `statSync`, поэтому
  // отказ приходит именно от границы, а не от «это не файл».
  it('writeVaultFile не пишет сквозь junction наружу', (ctx) => {
    if (!makeEscapingJunction(ctx)) return
    expect(() => writeVaultFile(vaultPath, 'escape-link', 'подменено')).toThrow(
      PathOutsideVaultError
    )
  })

  it('обычный файл внутри проекта читается и пишется по-прежнему', () => {
    const inside = path.join(vaultPath, 'заметка.md')
    fs.writeFileSync(inside, 'было')
    expect(resolveVaultContentRel(vaultPath, 'заметка.md')).toBe(inside)
    writeVaultFile(vaultPath, 'заметка.md', 'стало')
    expect(fs.readFileSync(inside, 'utf8')).toBe('стало')
  })

  it('корень проекта документом не считается', () => {
    expect(() => resolveVaultContentRel(vaultPath, '.')).toThrow(PathOutsideVaultError)
  })
})

describe('validateEntryName', () => {
  it('rejects an empty name', () => {
    expect(validateEntryName('')).toBe('Имя не может быть пустым')
  })

  it.each(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])(
    'rejects a name containing the forbidden character %s',
    (char) => {
      expect(validateEntryName(`bad${char}name`)).not.toBeNull()
    }
  )

  it('rejects a name made entirely of dots', () => {
    expect(validateEntryName('.')).not.toBeNull()
    expect(validateEntryName('..')).not.toBeNull()
    expect(validateEntryName('...')).not.toBeNull()
  })

  it('accepts a normal name, including Cyrillic and spaces', () => {
    expect(validateEntryName('Отчёт по фасаду.docx')).toBeNull()
    expect(validateEntryName('notes')).toBeNull()
  })

  // Fix-iteration 1 (review minor): reserved Windows device names — legal on
  // most other operating systems, but Windows refuses to create/open them
  // regardless of extension.
  it.each(['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9'])(
    'rejects the reserved device name %s',
    (name) => {
      expect(validateEntryName(name)).not.toBeNull()
    }
  )

  it('rejects a reserved device name even with an extension ("con.txt")', () => {
    expect(validateEntryName('con.txt')).not.toBeNull()
  })

  it('does not reject a name that merely starts with a device name', () => {
    expect(validateEntryName('console.txt')).toBeNull()
    expect(validateEntryName('constants.md')).toBeNull()
  })

  // Fix-iteration 1 (review minor): Windows silently strips a trailing dot
  // or space from a filename, so "notes." and "notes" would otherwise
  // collide.
  it('rejects a name ending in a dot', () => {
    expect(validateEntryName('notes.')).not.toBeNull()
  })

  it('rejects a name ending in a space', () => {
    expect(validateEntryName('notes ')).not.toBeNull()
  })
})

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aecpilot-vault-fs-'))
}

describe('buildVaultTree', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = makeTempDir()
    fs.mkdirSync(path.join(vaultPath, '.aecpilot'))
    fs.writeFileSync(path.join(vaultPath, '.aecpilot', 'project.json'), '{}')
    fs.mkdirSync(path.join(vaultPath, 'wiki'))
    fs.writeFileSync(path.join(vaultPath, 'wiki', 'index.md'), '# wiki')
    fs.mkdirSync(path.join(vaultPath, 'workspace'))
    fs.writeFileSync(path.join(vaultPath, 'AGENTS.md'), '# agents')
    fs.writeFileSync(path.join(vaultPath, 'a-file.txt'), 'hi')
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('hides .aecpilot, sorts dirs before files, then alphabetically', () => {
    const tree = buildVaultTree(vaultPath)
    expect(tree.map((n) => n.name)).toEqual(['wiki', 'workspace', 'a-file.txt', 'AGENTS.md'])
    expect(tree.every((n) => n.name !== '.aecpilot')).toBe(true)
  })

  it('recurses into subdirectories with posix-style rel paths', () => {
    const tree = buildVaultTree(vaultPath)
    const wiki = tree.find((n) => n.name === 'wiki')
    expect(wiki?.type).toBe('dir')
    expect(wiki?.children).toEqual([{ name: 'index.md', path: 'wiki/index.md', type: 'file' }])
  })

  it('marks files as type "file" without a children array', () => {
    const tree = buildVaultTree(vaultPath)
    const file = tree.find((n) => n.name === 'a-file.txt')
    expect(file).toEqual({ name: 'a-file.txt', path: 'a-file.txt', type: 'file' })
  })
})

describe('createFileEntry / createDirEntry', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = makeTempDir()
    fs.mkdirSync(path.join(vaultPath, 'wiki'))
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('creates an empty file at the vault root', () => {
    createFileEntry(vaultPath, undefined, 'notes.md')
    expect(fs.readFileSync(path.join(vaultPath, 'notes.md'), 'utf-8')).toBe('')
  })

  it('creates a file inside a subfolder', () => {
    createFileEntry(vaultPath, 'wiki', 'page.md')
    expect(fs.existsSync(path.join(vaultPath, 'wiki', 'page.md'))).toBe(true)
  })

  it('creates a new directory', () => {
    createDirEntry(vaultPath, undefined, 'drafts')
    expect(fs.statSync(path.join(vaultPath, 'drafts')).isDirectory()).toBe(true)
  })

  it('rejects creating a file with an invalid name', () => {
    expect(() => createFileEntry(vaultPath, undefined, 'bad:name')).toThrow()
  })

  it('rejects creating a file that already exists', () => {
    createFileEntry(vaultPath, undefined, 'dup.md')
    expect(() => createFileEntry(vaultPath, undefined, 'dup.md')).toThrow(
      'Файл или папка с таким именем уже существует'
    )
  })

  it('rejects creating inside .aecpilot', () => {
    expect(() => createFileEntry(vaultPath, '.aecpilot', 'evil.json')).toThrow(
      PathOutsideVaultError
    )
  })
})

describe('renameEntry', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = makeTempDir()
    fs.mkdirSync(path.join(vaultPath, 'wiki'))
    fs.writeFileSync(path.join(vaultPath, 'wiki', 'old.md'), 'content')
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('renames a file within its parent folder', () => {
    renameEntry(vaultPath, 'wiki/old.md', 'new.md')
    expect(fs.existsSync(path.join(vaultPath, 'wiki', 'old.md'))).toBe(false)
    expect(fs.readFileSync(path.join(vaultPath, 'wiki', 'new.md'), 'utf-8')).toBe('content')
  })

  it('rejects renaming to an already-existing name', () => {
    fs.writeFileSync(path.join(vaultPath, 'wiki', 'new.md'), 'other')
    expect(() => renameEntry(vaultPath, 'wiki/old.md', 'new.md')).toThrow(
      'Файл или папка с таким именем уже существует'
    )
  })

  it('rejects renaming to an invalid name', () => {
    expect(() => renameEntry(vaultPath, 'wiki/old.md', 'bad/name')).toThrow()
  })

  it('rejects renaming a path that escapes the vault', () => {
    expect(() => renameEntry(vaultPath, '..\\outside.md', 'new.md')).toThrow(PathOutsideVaultError)
  })
})

// Задача 4.5: сохранение из MD-редактора. Проверяется не «записалось ли», а
// три отказа, каждый из которых иначе стал бы дырой: запись мимо vault, запись
// в папку и создание файла по присланному пути.
describe('writeVaultFile', () => {
  let vaultPath: string

  beforeEach(() => {
    vaultPath = makeTempDir()
    fs.mkdirSync(path.join(vaultPath, 'wiki'))
    fs.writeFileSync(path.join(vaultPath, 'wiki', 'страница.md'), 'старое')
  })

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true })
  })

  it('перезаписывает существующий файл в UTF-8', () => {
    writeVaultFile(vaultPath, 'wiki/страница.md', '# Кабельный журнал')

    expect(fs.readFileSync(path.join(vaultPath, 'wiki', 'страница.md'), 'utf-8')).toBe(
      '# Кабельный журнал'
    )
  })

  it('не заводит новый файл по присланному пути', () => {
    // Заводить файлы умеет createFileEntry со своей проверкой имени; редактор
    // сохраняет только то, что уже открыл.
    expect(() => writeVaultFile(vaultPath, 'wiki/новая.md', 'текст')).toThrow()
    expect(fs.existsSync(path.join(vaultPath, 'wiki', 'новая.md'))).toBe(false)
  })

  it('не пишет в папку', () => {
    expect(() => writeVaultFile(vaultPath, 'wiki', 'текст')).toThrow('Это не файл')
  })

  it('не пишет за пределы vault', () => {
    expect(() => writeVaultFile(vaultPath, '..\\чужое.md', 'текст')).toThrow(PathOutsideVaultError)
  })
})
