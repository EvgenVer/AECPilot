/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/pane-shell/tree/renderer/tree-node.tsx
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { LayoutNode } from '../model'

import { TreeGroup } from './tree-group'
import { TreeSplit } from './tree-split'

/** Dispatch a layout node to its renderer — the split/group recursion point.
 *  `root` marks the tree's top split (side collapse applies only there).
 *  `rootRow` marks the row split that owns the side columns — usually the root
 *  itself, but in a column-root layout (Terminal deck, Quad) it's the row
 *  child holding sessions/workspace/files. Side collapse (⌘B/⌘J) applies here.
 *  `parentAxis` is the containing split's orientation — a group collapses
 *  ALONG that axis, so it picks the minimized form (row → vertical rail,
 *  column → horizontal header). `railSide` is which half of that row the
 *  child sits in — the rail's divider stroke faces the content side. */
export function TreeNode({
  node,
  parentAxis,
  railSide,
  root,
  rootRow,
  topEdge = false,
  leftEdge = false,
  rightEdge = false
}: {
  node: LayoutNode
  parentAxis?: 'column' | 'row'
  railSide?: 'left' | 'right'
  root?: boolean
  rootRow?: boolean
  topEdge?: boolean
  leftEdge?: boolean
  rightEdge?: boolean
}) {
  return node.type === 'split' ? (
    <TreeSplit leftEdge={leftEdge} node={node} rightEdge={rightEdge} root={root} rootRow={rootRow} topEdge={topEdge} />
  ) : (
    <TreeGroup
      leftEdge={leftEdge}
      node={node}
      parentAxis={parentAxis}
      railSide={railSide}
      rightEdge={rightEdge}
      topEdge={topEdge}
    />
  )
}
