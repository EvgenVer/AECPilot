// The Index page's tree (task 3J.10, SPEC UR44): `aec-rag inventory` lists
// files flat, a person reads a project by its folders. Building the tree and
// its folder counters is here, away from React, so it has tests.

import type { InventoryFile } from '../../../../shared/ipc'

export interface InventoryFolder {
  children: InventoryNode[]
  /** Files under this folder, at any depth. */
  files: number
  kind: 'folder'
  name: string
  /** Files under it that need a look — see `isProblem`. */
  problems: number
  /** Path inside the source, `''` for the source itself. */
  rel: string
  sourceId: string
}

export interface InventoryLeaf {
  file: InventoryFile
  kind: 'file'
  name: string
}

export type InventoryNode = InventoryFolder | InventoryLeaf

/** A file the person has to know about: not in the index at its current
 *  content, or failed somewhere, or with a scanned page that could not be read. */
export function isProblem(file: InventoryFile): boolean {
  return (
    file.index !== 'indexed' ||
    file.errors.length > 0 ||
    (file.scans !== null && file.scans.failed > 0)
  )
}

/** Files the index can take again — «повторить» makes sense only for these. */
export function canRetry(file: InventoryFile): boolean {
  return file.index === 'failed' || file.index === 'stale' || file.index === 'missing'
}

/** One root per source, in the order given; `onlyProblems` keeps the files
 *  that need a look and the folders on the way to them. Folders first, then
 *  files, each by name. */
export function buildInventoryTree(
  files: InventoryFile[],
  sources: { id: string; name: string }[],
  onlyProblems = false
): InventoryFolder[] {
  const roots = sources.map((source): InventoryFolder => ({
    children: [],
    files: 0,
    kind: 'folder',
    name: source.name,
    problems: 0,
    rel: '',
    sourceId: source.id
  }))
  const byId = new Map(roots.map((root) => [root.sourceId, root]))

  for (const file of files) {
    const root = byId.get(file.source_id)
    if (!root) continue
    const problem = isProblem(file)
    if (onlyProblems && !problem) continue

    const parts = file.rel_path.split('/')
    let folder = root
    const count = (target: InventoryFolder): void => {
      target.files += 1
      if (problem) target.problems += 1
    }
    count(folder)
    for (const part of parts.slice(0, -1)) {
      const rel = folder.rel ? `${folder.rel}/${part}` : part
      let next = folder.children.find(
        (child): child is InventoryFolder => child.kind === 'folder' && child.name === part
      )
      if (!next) {
        next = {
          children: [],
          files: 0,
          kind: 'folder',
          name: part,
          problems: 0,
          rel,
          sourceId: root.sourceId
        }
        folder.children.push(next)
      }
      folder = next
      count(folder)
    }
    folder.children.push({ file, kind: 'file', name: parts[parts.length - 1] })
  }

  for (const root of roots) sortTree(root)
  return roots
}

function sortTree(folder: InventoryFolder): void {
  folder.children.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name, 'ru') : a.kind === 'folder' ? -1 : 1
  )
  for (const child of folder.children) if (child.kind === 'folder') sortTree(child)
}
