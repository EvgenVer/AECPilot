// Source filesystem helpers for task 1.8 (sources shown in the sidebar tree
// with an RO badge + availability status): builds a connected source's
// directory tree and reports whether its root is currently reachable. A
// source is read-only by construction — there are no write operations here,
// or anywhere, for a source (see specs/workspace-sources.md's "Гарантия
// read-only"). An anti-traversal resolver for a client-supplied rel path
// (the future read-operations equivalent of vault-fs.ts's `resolveVaultRel`)
// deliberately isn't here yet — it belongs with whatever task first needs to
// resolve one (fix-iteration 1: dead code removed rather than speculated
// ahead of that task).

import * as fs from 'node:fs'
import { join, resolve } from 'node:path'

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
