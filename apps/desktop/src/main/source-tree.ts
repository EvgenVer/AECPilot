// Source filesystem helpers for task 1.8 (sources shown in the sidebar tree
// with an RO badge + availability status): builds a connected source's
// directory tree and reports whether its root is currently reachable. A
// source is read-only by construction — there are no write operations here,
// or anywhere, for a source (see specs/workspace-sources.md's "Гарантия
// read-only").
//
// Task 1.5.5 adds `resolveSourceEntryRel` — an anti-traversal resolver for a
// client-supplied rel path, backing "Показать в проводнике"/"Копировать
// путь" for a source's entries (any nesting level, including the source's
// own root). Deliberately a standalone duplicate of vault-fs.ts's
// lexical-resolve + realpath-containment pattern rather than an import from
// it: vault-fs.ts and source-tree.ts stay decoupled modules (vault vs.
// source concerns), same reasoning as this file's own doc-comment history
// (a fix-iteration removed a premature version of this resolver rather than
// speculate ahead of the task that actually needed one — this is that task).

// Task 4D-8: every filesystem call here is async, and that is not a style
// choice. A source root is routinely a network share, and a share that has
// gone away does not fail — it hangs until the OS gives up, tens of seconds
// later. Synchronously, that hang is the whole main process: no window
// repaints, no menu responds, nothing else runs. Asynchronously the same wait
// costs one pending promise. The lexical checks below stay synchronous — they
// never touch the disk, which is the point of doing them first.

import * as fs from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { mainT } from './i18n'

export interface SourceTreeNode {
  name: string
  /** Rel path from the source root, posix-style (`/`-separated) regardless
   * of host OS — same convention as vault-fs.ts's `VaultTreeNode.path`. */
  path: string
  type: 'dir' | 'file'
  /** Present (possibly empty) for directories; absent for files and for
   * symlinks (shown as a leaf, never traversed — avoids symlink cycles,
   * same decision as `buildVaultTree`). */
  children?: SourceTreeNode[]
}

/** Whether a source's root is currently reachable: exists and is a
 * directory. Cheap (a single stat, no directory read) — used by
 * both `sources:status` (via `project-manager.ts`'s `getSourceStatusResult`,
 * called for every source on load) and `sources:tree` (via
 * `getSourceTreeResult`, before the full recursive build). An error here
 * (path gone, network share dropped, permission revoked, …) is reported as
 * `unavailable`, never thrown, so one bad source never blocks the others. */
export async function isSourceAvailable(rootPath: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(rootPath)).isDirectory()
  } catch {
    return false
  }
}

/** Recursively builds a connected source's file tree, rooted at `rootPath`.
 * Same sort/symlink rules as `buildVaultTree` (dirs before files, then
 * alphabetical in Russian locale; a symlink is shown as a leaf, never
 * traversed — avoids symlink cycles). Throws if `rootPath` can't be read —
 * callers should check `isSourceAvailable` first (see `getSourceTreeResult`)
 * to produce the `unavailable` status instead of surfacing the raw error. */
export async function buildSourceTree(rootPath: string): Promise<SourceTreeNode[]> {
  return readSourceDir(resolve(rootPath), '')
}

async function readSourceDir(absDir: string, relPrefix: string): Promise<SourceTreeNode[]> {
  const entries = await fs.promises.readdir(absDir, { withFileTypes: true })
  const nodes: SourceTreeNode[] = []

  for (const entry of entries) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    if (entry.isSymbolicLink()) {
      nodes.push({ name: entry.name, path: rel, type: 'file' })
    } else if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: rel,
        type: 'dir',
        children: await readSourceDir(join(absDir, entry.name), rel)
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

export class PathOutsideSourceError extends Error {}

// eslint-disable-next-line no-control-regex -- deliberate: rejects control chars in a path segment
const CONTROL_CHAR_RE = /[\x00-\x1f]/
const ALL_DOTS_RE = /^\.{2,}$/

function hasUnsupportedPrefix(p: string): boolean {
  return p.startsWith('\\\\?\\') || p.startsWith('\\\\.\\')
}

/** Splits a posix-or-windows-style relative path into sanitized segments,
 * rejecting any traversal attempt — same rule set as vault-fs.ts's own
 * `sanitizedSegments` (see this file's module doc for why it's duplicated
 * rather than shared). */
function sanitizedSegments(rel: string): string[] {
  if (CONTROL_CHAR_RE.test(rel)) {
    throw new PathOutsideSourceError(mainT('path.controlChars'))
  }
  if (hasUnsupportedPrefix(rel)) {
    throw new PathOutsideSourceError(mainT('path.devicePrefix'))
  }
  if (isAbsolute(rel)) {
    throw new PathOutsideSourceError(mainT('source.relativeInside'))
  }

  const rawParts = rel.split(/[\\/]+/).filter((p) => p.length > 0)
  const parts: string[] = []
  for (const part of rawParts) {
    if (part === '.') continue // harmless "current directory" component
    if (part.includes(':')) {
      throw new PathOutsideSourceError(mainT('path.colon'))
    }
    if (part === '..' || ALL_DOTS_RE.test(part.trimEnd())) {
      throw new PathOutsideSourceError(mainT('source.cannotLeave'))
    }
    parts.push(part)
  }
  return parts
}

/** Lexical-only resolution: sanitizes `rel` and joins it onto `root`,
 * rejecting any traversal attempt. Empty/`null`/`undefined` `rel` resolves
 * to `root` itself (unlike vault-fs.ts's entry-rel resolver, a source's own
 * root IS a legal target here — "Показать в проводнике"/"Копировать путь"
 * on the source's root row itself is a real, needed operation). Never
 * touches the filesystem — the real-path (symlink) containment check is
 * layered on top by `resolveSourceEntryRel` below. */
function lexicalResolve(root: string, rel?: string | null): string {
  if (!rel) return root

  const parts = sanitizedSegments(rel)
  if (parts.length === 0) return root

  const candidate = resolve(root, ...parts)
  const rel2 = relative(root, candidate)
  if (rel2 !== '' && (rel2.startsWith('..') || isAbsolute(rel2))) {
    throw new PathOutsideSourceError(mainT('source.leaves'))
  }
  return candidate
}

/** Whether `absPath`'s real (symlink-resolved) path is `realRoot` itself or
 * nested inside it — same semantics as vault-fs.ts's `isWithinRealRoot`. If
 * `absPath` doesn't exist (or isn't accessible), this returns `true` —
 * nothing to escape *through* yet. */
async function isWithinRealRoot(realRoot: string, absPath: string): Promise<boolean> {
  let real: string
  try {
    real = await fs.promises.realpath(absPath)
  } catch {
    return true
  }
  const rel = relative(realRoot, real)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** `realpath`, falling back to the plain resolved path if the target
 * doesn't exist (or isn't accessible) — same fallback rationale as
 * vault-fs.ts's `safeRealpath` (keeps this usable against fixture paths in
 * tests that only exercise the lexical/naming checks). */
async function safeRealpath(p: string): Promise<string> {
  try {
    return await fs.promises.realpath(p)
  } catch {
    return p
  }
}

/** Resolves `rel` (a client-supplied relative path, `/` or `\`-separated)
 * against a connected source's `rootPath`, rejecting any escape attempt
 * (`..`, absolute paths, `\\?\`/`\\.\` device prefixes, control characters,
 * drive-relative `C:foo`, …) — including one smuggled through a symlink:
 * the entry's *parent* directory chain must still be inside the source's
 * real root (the entry itself may be a symlink — only *traversing through*
 * one to reach it is rejected, same as vault-fs.ts's `resolveVaultEntryRel`).
 * Empty/`null`/`undefined` `rel` (or one that lexically resolves to the
 * root, e.g. `.`, `./`) resolves to the source's root itself — unlike a
 * vault entry op, a source's root is a legal "Показать в проводнике"/
 * "Копировать путь" target (there's no rename/delete to guard against, a
 * source has no write operations at all). Backs `sources:show-in-explorer`/
 * `sources:get-entry-path`. */
export async function resolveSourceEntryRel(
  rootPath: string,
  rel?: string | null
): Promise<string> {
  const root = resolve(rootPath)
  const candidate = lexicalResolve(root, rel)
  if (candidate === root) return root

  const realRoot = await safeRealpath(root)
  if (!(await isWithinRealRoot(realRoot, dirname(candidate)))) {
    throw new PathOutsideSourceError(mainT('source.symlink'))
  }
  return candidate
}

/** Resolves `rel` for READING a source file's contents — the counterpart of
 * vault-fs.ts's `resolveVaultContentRel`, and for the same reason (finding
 * D-44): `readFile` follows the symlink leaf, so the *whole* resolved path
 * must really be inside the source's root, not just its parent chain. The
 * root itself is rejected here — it is a directory, not a document — even
 * though `resolveSourceEntryRel` legitimately allows it for "show in
 * explorer". Backs the source branch of `viewer:read-document`. */
export async function resolveSourceContentRel(rootPath: string, rel: string): Promise<string> {
  if (!rel || rel.trim().length === 0) {
    throw new PathOutsideSourceError(mainT('path.empty'))
  }
  const root = resolve(rootPath)
  const candidate = lexicalResolve(root, rel)
  if (candidate === root) {
    throw new PathOutsideSourceError(mainT('source.isSourceFolder'))
  }

  const realRoot = await safeRealpath(root)
  if (!(await isWithinRealRoot(realRoot, candidate))) {
    throw new PathOutsideSourceError(mainT('source.symlink'))
  }
  return candidate
}
