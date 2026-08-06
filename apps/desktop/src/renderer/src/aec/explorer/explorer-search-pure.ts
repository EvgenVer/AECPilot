// Pure logic for the explorer's filter box: name matching, the
// ancestor-of-a-match rule, and the highlight split. Independent of React so
// it is testable on its own — and it outlived the screen it was written for
// (task 1.5.6): the component moved to `aec/explorer` in the 1.8 migration,
// these rules did not change.
//
// `subtreeMatchesSearchQuery` keeps a non-matching folder visible when it is
// the only path down to a match inside it. It searches whatever subtree is
// already loaded and never triggers a fetch: a source's tree arrives whole on
// first expand, and a source nobody has opened has nothing to search — such a
// row stays visible rather than being hidden on no evidence.

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

/** Splits `name` around the first case-insensitive occurrence of `query`, for
 * highlighting a match. `match` is `''` (whole name in `pre`) when `query` is
 * empty or does not occur in `name`. */
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
