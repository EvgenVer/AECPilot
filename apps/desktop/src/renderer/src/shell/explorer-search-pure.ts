// Pure logic for task 1.5.6's explorer search/filter box (Sidebar.tsx): name
// matching + match-highlighting split, kept independent of React/react-
// arborist so it's unit-testable on its own (same convention as
// source-status-pure.ts / scan-notification-pure.ts). Used two ways:
// - the vault tree (react-arborist) plugs `matchesSearchQuery` straight into
//   its own `searchMatch` prop — react-arborist already walks the tree
//   itself and keeps a non-matching folder visible when one of its
//   descendants matches (ancestor-of-a-match), so this only ever needs to
//   check one node's own name;
// - the hand-rolled "Источники" section (task 1.5.5) has no such built-in
//   walker, so `subtreeMatchesSearchQuery` reimplements the same
//   ancestor-of-a-match rule by hand, over whatever subtree is already
//   loaded (a connected source's tree is fetched whole on first expand, see
//   `getSourceTree` — so this never triggers a fetch itself; a source that
//   hasn't been expanded yet has nothing loaded to search, and is left
//   visible rather than hidden — see Sidebar.tsx's `ExplorerSourceRoot`).

export interface NamedNode {
  name: string
  children?: readonly NamedNode[]
}

/** Case-insensitive substring match of a single node's own name. An empty
 * (or whitespace-only) `query` matches everything. */
export function matchesSearchQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || name.toLowerCase().includes(q)
}

/** Whether `node` should stay visible while filtering by `query`: its own
 * name matches, or at least one descendant's name does (so a non-matching
 * folder still shows when it's the only path down to a match inside it). */
export function subtreeMatchesSearchQuery(node: NamedNode, query: string): boolean {
  if (matchesSearchQuery(node.name, query)) return true
  return (node.children ?? []).some((child) => subtreeMatchesSearchQuery(child, query))
}

export interface QuerySplit {
  pre: string
  match: string
  post: string
}

/** Splits `name` around the first case-insensitive occurrence of `query`,
 * for highlighting a search match (mirrors design/screens/Explorer.html's
 * search-mode row rendering). `match` is `''` (whole name in `pre`) when
 * `query` is empty or doesn't occur in `name`. */
export function splitBySearchQuery(name: string, query: string): QuerySplit {
  const q = query.trim()
  if (q === '') return { pre: name, match: '', post: '' }
  const idx = name.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return { pre: name, match: '', post: '' }
  return {
    pre: name.slice(0, idx),
    match: name.slice(idx, idx + q.length),
    post: name.slice(idx + q.length)
  }
}
