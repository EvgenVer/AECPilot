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

import * as fs from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

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
 * directory. Cheap (a single `fs.statSync`, no directory read) — used by
 * both `sources:status` (via `project-manager.ts`'s `getSourceStatusResult`,
 * called for every source on load) and `sources:tree` (via
 * `getSourceTreeResult`, before the full recursive build). An error here
 * (path gone, network share dropped, permission revoked, …) is reported as
 * `unavailable`, never thrown, so one bad source never blocks the others. */
export function isSourceAvailable(rootPath: string): boolean {
  try {
    return fs.statSync(rootPath).isDirectory()
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
export function buildSourceTree(rootPath: string): SourceTreeNode[] {
  return readSourceDir(resolve(rootPath), '')
}

function readSourceDir(absDir: string, relPrefix: string): SourceTreeNode[] {
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
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
        children: readSourceDir(join(absDir, entry.name), rel)
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
    throw new PathOutsideSourceError('Путь содержит недопустимые управляющие символы')
  }
  if (hasUnsupportedPrefix(rel)) {
    throw new PathOutsideSourceError(
      'Служебные префиксы путей (\\\\?\\, \\\\.\\) не поддерживаются'
    )
  }
  if (isAbsolute(rel)) {
    throw new PathOutsideSourceError('Путь должен быть относительным путём внутри источника')
  }

  const rawParts = rel.split(/[\\/]+/).filter((p) => p.length > 0)
  const parts: string[] = []
  for (const part of rawParts) {
    if (part === '.') continue // harmless "current directory" component
    if (part.includes(':')) {
      throw new PathOutsideSourceError('Путь не может содержать «:»')
    }
    if (part === '..' || ALL_DOTS_RE.test(part.trimEnd())) {
      throw new PathOutsideSourceError('Путь не может выходить за пределы источника')
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
    throw new PathOutsideSourceError('Путь выходит за пределы источника')
  }
  return candidate
}

/** Whether `absPath`'s real (symlink-resolved) path is `realRoot` itself or
 * nested inside it — same semantics as vault-fs.ts's `isWithinRealRoot`. If
 * `absPath` doesn't exist (or isn't accessible), this returns `true` —
 * nothing to escape *through* yet. */
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

/** `fs.realpathSync`, falling back to the plain resolved path if the target
 * doesn't exist (or isn't accessible) — same fallback rationale as
 * vault-fs.ts's `safeRealpath` (keeps this usable against fixture paths in
 * tests that only exercise the lexical/naming checks). */
function safeRealpath(p: string): string {
  try {
    return fs.realpathSync(p)
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
export function resolveSourceEntryRel(rootPath: string, rel?: string | null): string {
  const root = resolve(rootPath)
  const candidate = lexicalResolve(root, rel)
  if (candidate === root) return root

  const realRoot = safeRealpath(root)
  if (!isWithinRealRoot(realRoot, dirname(candidate))) {
    throw new PathOutsideSourceError('Путь ведёт за пределы источника через симлинк')
  }
  return candidate
}
