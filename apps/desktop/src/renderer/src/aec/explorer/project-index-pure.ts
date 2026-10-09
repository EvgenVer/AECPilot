// Task 3K.5 (SPEC UR45): which index items the vault tree offers on a row.
// The marks are FILES (`project.json.project_index`); a folder is marked as far
// as the files under it are — all of them, some, or none.

import type { VaultTreeNode } from '../../../../shared/ipc'

export type IndexMark = 'all' | 'none' | 'some'

function filesOf(node: VaultTreeNode): string[] {
  if (node.type !== 'dir') return [node.path]
  return (node.children ?? []).flatMap(filesOf)
}

export function indexMark(node: VaultTreeNode, marked: ReadonlySet<string>): IndexMark {
  if (node.type !== 'dir') return marked.has(node.path) ? 'all' : 'none'
  const prefix = `${node.path}/`
  if (![...marked].some((path) => path.startsWith(prefix))) return 'none'
  // A marked file that has since left the folder still counts as «some»: the
  // person can take it out from here.
  const files = filesOf(node)
  return files.length > 0 && files.every((path) => marked.has(path)) ? 'all' : 'some'
}
