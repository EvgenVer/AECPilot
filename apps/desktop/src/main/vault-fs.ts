// Vault filesystem helpers for task 1.6 (the explorer tree): builds the
// vault's directory tree and validates/executes create/rename operations.
// All operations are confined to a project's open vault — anti-traversal
// resolution here is the TS analog of mcp/aec_sources's resolve_in_root
// (see mcp/aec_sources/src/aec_sources/paths.py), reused because the same
// class of attack (`..`, absolute paths, `\\?\`/`\\.\` device prefixes,
// control characters, drive-relative "C:foo") applies to a client-supplied
// relative path here too. Delete is intentionally NOT here — it goes through
// Electron's `shell.trashItem`, which needs the `electron` import that this
// module deliberately avoids (kept free of `electron` the same way
// project-manager.ts is, so it stays directly unit-testable); main/index.ts
// resolves the absolute path via `resolveVaultEntryRel` and calls
// `shell.trashItem` itself.

import * as fs from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

export interface VaultTreeNode {
  name: string
  /** Rel path from the vault root, posix-style (`/`-separated) regardless of
   * host OS — the renderer/IPC layer always uses this form. */
  path: string
  type: 'dir' | 'file'
  /** Present (possibly empty) for directories; absent for files and for
   * symlinks (which are shown as a leaf — see the "не разворачивать"
   * decision in the task brief: a symlink's target is never traversed, to
   * avoid symlink cycles). */
  children?: VaultTreeNode[]
}

export class PathOutsideVaultError extends Error {}

// eslint-disable-next-line no-control-regex -- deliberate: rejects control chars in a path segment
const CONTROL_CHAR_RE = /[\x00-\x1f]/
const ALL_DOTS_RE = /^\.{2,}$/

function hasUnsupportedPrefix(p: string): boolean {
  return p.startsWith('\\\\?\\') || p.startsWith('\\\\.\\')
}

/** Splits a posix-or-windows-style relative path into sanitized segments,
 * rejecting any traversal attempt. Shared by `resolveVaultRel` and the
 * "is this rel inside .aecpilot" guard. */
function sanitizedSegments(rel: string): string[] {
  if (CONTROL_CHAR_RE.test(rel)) {
    throw new PathOutsideVaultError('Путь содержит недопустимые управляющие символы')
  }
  if (hasUnsupportedPrefix(rel)) {
    throw new PathOutsideVaultError('Служебные префиксы путей (\\\\?\\, \\\\.\\) не поддерживаются')
  }
  if (isAbsolute(rel)) {
    throw new PathOutsideVaultError('Путь должен быть относительным путём внутри проекта')
  }

  const rawParts = rel.split(/[\\/]+/).filter((p) => p.length > 0)
  const parts: string[] = []
  for (const part of rawParts) {
    if (part === '.') continue // harmless "current directory" component
    if (part.includes(':')) {
      throw new PathOutsideVaultError('Путь не может содержать «:»')
    }
    if (part === '..' || ALL_DOTS_RE.test(part.trimEnd())) {
      throw new PathOutsideVaultError('Путь не может выходить за пределы проекта')
    }
    parts.push(part)
  }
  return parts
}

/** Lexical-only resolution shared by `resolveVaultRel`/`resolveVaultEntryRel`:
 * sanitizes `rel` and joins it onto `root`, rejecting any traversal attempt
 * and any `.aecpilot`-rooted path (see module doc). Empty/`null`/`undefined`
 * `rel` resolves to `root` itself. Never touches the filesystem — the
 * real-path (symlink) containment check is layered on top by the two public
 * functions below, since they need different strictness (see their docs). */
function lexicalResolve(root: string, rel?: string | null): string {
  if (!rel) return root

  const parts = sanitizedSegments(rel)
  if (parts.length === 0) return root
  if (parts[0].toLowerCase() === '.aecpilot') {
    throw new PathOutsideVaultError('Доступ к служебной папке .aecpilot запрещён')
  }

  const candidate = resolve(root, ...parts)
  const rel2 = relative(root, candidate)
  if (rel2 !== '' && (rel2.startsWith('..') || isAbsolute(rel2))) {
    throw new PathOutsideVaultError('Путь выходит за пределы проекта')
  }
  return candidate
}

/** Whether `absPath`'s real (symlink-resolved) path is `realRoot` itself or
 * nested inside it. If `absPath` doesn't exist (or isn't accessible), this
 * returns `true` — there is nothing to escape *through* yet, and the actual
 * filesystem operation (write/rename/stat) will surface its own error. */
function isWithinRealRoot(realRoot: string, absPath: string): boolean {
  let real: string
  try {
    real = fs.realpathSync(absPath)
  } catch {
    return true
  }
  const rel = relative(realRoot, real)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Resolves `rel` (a client-supplied relative path, `/` or `\`-separated)
 * against `vaultPath`, rejecting any escape attempt (see module doc for the
 * full list) — including one smuggled through a symlink: the *entire*
 * resolved path's real (symlink-resolved) location must still be inside the
 * vault's real root. Used for a *directory a new entry is written into*
 * (`createFileEntry`/`createDirEntry`'s `parentRel`) — the write goes
 * through whatever that directory really is, so it is checked in full, not
 * just its parent (contrast `resolveVaultEntryRel` below). Empty/`null`/
 * `undefined` `rel` resolves to `vaultPath` itself. */
export function resolveVaultRel(vaultPath: string, rel?: string | null): string {
  const root = resolve(vaultPath)
  const candidate = lexicalResolve(root, rel)
  const realRoot = safeRealpath(root)
  if (!isWithinRealRoot(realRoot, candidate)) {
    throw new PathOutsideVaultError('Путь ведёт за пределы проекта через симлинк')
  }
  return candidate
}

/** Resolves `rel` for an operation on an *existing entry itself*
 * (rename/delete/"show in explorer") — never the vault root (an empty/
 * whitespace-only `rel`, or one that lexically resolves to the vault root
 * itself, e.g. `.`, `./`, `./.`, `.//`, is rejected: renaming or trashing the
 * whole vault is never a valid entry operation). Only the entry's *parent*
 * directory chain is checked against real-path (symlink) escape — the entry
 * itself is allowed to be a symlink, since renaming/deleting a symlink acts
 * on the link, not on whatever it points to; only *traversing through* a
 * symlink to reach the entry is rejected. */
export function resolveVaultEntryRel(vaultPath: string, rel: string): string {
  if (!rel || rel.trim().length === 0) {
    throw new PathOutsideVaultError('Путь не может быть пустым')
  }
  const root = resolve(vaultPath)
  const candidate = lexicalResolve(root, rel)
  if (candidate === root) {
    throw new PathOutsideVaultError('Операция над корнем vault недопустима')
  }
  const realRoot = safeRealpath(root)
  if (!isWithinRealRoot(realRoot, dirname(candidate))) {
    throw new PathOutsideVaultError('Путь ведёт за пределы проекта через симлинк')
  }
  return candidate
}

/** `fs.realpathSync`, falling back to the plain resolved path if the target
 * doesn't exist (or isn't accessible) — the vault root is expected to
 * exist, but tolerating a missing one keeps this usable against fixture
 * paths in tests that only exercise the lexical/naming checks. */
function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return p
  }
}

const FORBIDDEN_NAME_CHARS_RE = /[<>:"/\\|?*]/
const TRAILING_DOT_OR_SPACE_RE = /[. ]$/
const RESERVED_DEVICE_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9'
])

/** Validates a new file/folder name (create or rename target): non-empty,
 * none of the Windows-forbidden characters `< > : " / \ | ? *`, not made up
 * entirely of dots (`.`, `..`, `...`, …), doesn't end in a dot or space
 * (Windows silently strips these, which would otherwise let two different-
 * looking names collide), and isn't a reserved Windows device name — `CON`,
 * `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9` — case-insensitively and
 * regardless of extension (`"con.txt"` is reserved too; Windows only looks
 * at the part before the first dot). Returns a Russian error message, or
 * `null` if the name is valid. */
export function validateEntryName(name: string): string | null {
  if (name.length === 0) return 'Имя не может быть пустым'
  if (FORBIDDEN_NAME_CHARS_RE.test(name)) {
    return 'Имя содержит запрещённые символы: < > : " / \\ | ? *'
  }
  if (ALL_DOTS_RE.test(name) || name === '.') return 'Недопустимое имя'
  if (TRAILING_DOT_OR_SPACE_RE.test(name)) {
    return 'Имя не может заканчиваться точкой или пробелом'
  }
  const deviceBase = name.split('.')[0].toLowerCase()
  if (RESERVED_DEVICE_NAMES.has(deviceBase)) {
    return 'Это имя зарезервировано системой Windows (CON, PRN, AUX, NUL, COM1-9, LPT1-9)'
  }
  return null
}

/** Recursively builds the vault's file tree, rooted at `vaultPath`. Hides
 * `.aecpilot` (the vault's internal metadata), sorts directories before
 * files and then alphabetically (Russian locale) within each group, and does
 * not descend into symlinks (shown as a leaf, regardless of what they point
 * to — avoids symlink cycles; `fs.readdirSync`'s `Dirent` reports a
 * symlink's own type, not its target's, so `isDirectory()` is already
 * `false` for one). */
export function buildVaultTree(vaultPath: string): VaultTreeNode[] {
  return readVaultDir(resolve(vaultPath), '')
}

function readVaultDir(absDir: string, relPrefix: string): VaultTreeNode[] {
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  const nodes: VaultTreeNode[] = []

  for (const entry of entries) {
    if (relPrefix === '' && entry.name === '.aecpilot') continue

    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) {
      nodes.push({ name: entry.name, path: rel, type: 'file' })
    } else if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'dir',
        children: readVaultDir(join(absDir, entry.name), rel)
      })
    } else {
      nodes.push({ name: entry.name, path: rel, type: 'file' })
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, 'ru')
  })
  return nodes
}

/** Creates an empty file named `name` inside `parentRel` (relative to the
 * vault root; `''`/`undefined` means the vault root). Throws a
 * Russian-message `Error` on an invalid name, an escaping/`.aecpilot`
 * `parentRel`, or an already-existing entry at the target path. */
export function createFileEntry(
  vaultPath: string,
  parentRel: string | undefined,
  name: string
): void {
  const nameError = validateEntryName(name)
  if (nameError) throw new Error(nameError)
  const parentAbs = resolveVaultRel(vaultPath, parentRel)
  const target = join(parentAbs, name)
  if (fs.existsSync(target)) throw new Error('Файл или папка с таким именем уже существует')
  fs.writeFileSync(target, '')
}

/** Creates a new directory named `name` inside `parentRel` — same
 * validation/errors as `createFileEntry`. */
export function createDirEntry(
  vaultPath: string,
  parentRel: string | undefined,
  name: string
): void {
  const nameError = validateEntryName(name)
  if (nameError) throw new Error(nameError)
  const parentAbs = resolveVaultRel(vaultPath, parentRel)
  const target = join(parentAbs, name)
  if (fs.existsSync(target)) throw new Error('Файл или папка с таким именем уже существует')
  fs.mkdirSync(target)
}

/** Renames the file/folder at `rel` (relative to the vault root) to
 * `newName`, staying in the same parent folder. Throws a Russian-message
 * `Error` on an invalid new name, an escaping/`.aecpilot`/empty `rel`, or an
 * already-existing entry at the destination. */
export function renameEntry(vaultPath: string, rel: string, newName: string): void {
  const nameError = validateEntryName(newName)
  if (nameError) throw new Error(nameError)
  const oldAbs = resolveVaultEntryRel(vaultPath, rel)
  const newAbs = join(dirname(oldAbs), newName)
  if (fs.existsSync(newAbs)) throw new Error('Файл или папка с таким именем уже существует')
  fs.renameSync(oldAbs, newAbs)
}
