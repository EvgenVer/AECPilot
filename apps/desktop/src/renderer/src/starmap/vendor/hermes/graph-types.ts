// The donor's `@/types/hermes` starmap subset, kept locally so the vendored
// files below it need no rewriting beyond their import lines (task 1.6.B7.8).
//
// These are NOT our IPC types. `shared/ipc.ts`'s `LearningGraph` is tolerant —
// every field optional — because it describes what arrives over a wire we do
// not control. The renderer's layout and painter, in contrast, index into
// `category`, `useCount`, `state` and `pinned` on every frame and would have to
// guard each one. `starmap/graph-adapter.ts` fills the gap once, at the edge;
// past that point the strict shape below is what the vendored code sees, which
// is exactly the shape it was written against.
//
// Field names and their meanings come from `agent/learning_graph.py:279–307`,
// the handler that builds the payload.

export interface StarmapNode {
  id: string
  label: string
  kind: 'memory' | 'skill'
  memorySource?: 'memory' | 'profile'
  /** epoch SECONDS, or null when the node carries no date. */
  timestamp?: null | number
  category: string
  useCount: number
  state: string
  createdBy: null | string
  pinned: boolean
}

/** A declared `related_skills` link; both endpoints are guaranteed to be nodes
 * (their builder filters, and so does ours). */
export interface StarmapEdge {
  source: string
  target: string
}

export interface StarmapCluster {
  category: string
  count: number
}

/** Freeform memory rendered as a card — never a graph node. */
export interface StarmapMemoryCard {
  source: 'memory' | 'profile'
  timestamp?: null | number
  title: string
  body: string
}

export interface StarmapGraph {
  nodes: StarmapNode[]
  edges: StarmapEdge[]
  clusters: StarmapCluster[]
  memory: StarmapMemoryCard[]
  stats: Record<string, unknown>
}
