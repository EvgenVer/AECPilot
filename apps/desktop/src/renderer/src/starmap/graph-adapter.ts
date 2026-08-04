// The seam between our IPC shape and the vendored map (task 1.6.B7.11).
//
// `LearningGraph` (shared/ipc.ts) is tolerant — every field optional — because
// it describes a payload arriving over a wire we do not control. The donor's
// `StarmapGraph` is strict, because the layout and the painter index into
// `category`, `useCount`, `state` and `pinned` on every frame.
//
// Bridging them ONCE, here, is the whole point: the alternative is a guard at
// every read site inside 864 lines of drawing code we deliberately did not
// modify. Every default below is stated with why it is safe rather than
// convenient.

import type { LearningGraph } from '../../../shared/ipc'
import type {
  StarmapEdge,
  StarmapGraph,
  StarmapMemoryCard,
  StarmapNode
} from './vendor/hermes/graph-types'

/** Their id scheme for a memory chunk: `memory:<source>:<index>`
 * (`agent/learning_graph.py:296`). Used as the kind fallback when `kind` is
 * missing, since the prefix is structural and cannot be coincidental. */
function nodeKind(id: string, kind: string | undefined): 'memory' | 'skill' {
  return kind === 'memory' || id.startsWith('memory:') ? 'memory' : 'skill'
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function toStarmapGraph(graph: LearningGraph | undefined): StarmapGraph {
  const nodes: StarmapNode[] = []

  for (const node of graph?.nodes ?? []) {
    if (!node || typeof node.id !== 'string' || node.id === '') continue
    const kind = nodeKind(node.id, node.kind)
    nodes.push({
      id: node.id,
      // An unnamed node is drawn by its id rather than by an empty label: a
      // blank orb with a tooltip that says nothing is worse than a raw id.
      label: (node.label ?? '').trim() || node.id,
      kind,
      ...(kind === 'memory'
        ? { memorySource: node.id.startsWith('memory:profile') ? 'profile' : 'memory' }
        : {}),
      // `null`, not `0` and not "now": `timestamp` is genuinely nullable in
      // their payload, and the layout has a real branch for an undated node.
      // Substituting a date here would place it on a ring it does not belong
      // to, silently.
      timestamp:
        typeof node.timestamp === 'number' && Number.isFinite(node.timestamp)
          ? node.timestamp
          : null,
      category: node.category ?? (kind === 'memory' ? 'memory' : 'general'),
      useCount: toNumber(node.useCount),
      state: node.state ?? 'active',
      createdBy: node.createdBy ?? null,
      pinned: node.pinned === true
    })
  }

  const known = new Set(nodes.map((node) => node.id))
  // An edge to a node that is not in the graph makes `forceLink` throw the
  // moment it initialises ("node not found"). The simulation filters too; this
  // filter is the one that runs before anything else touches the data.
  const edges: StarmapEdge[] = (graph?.edges ?? [])
    .filter(
      (edge) =>
        edge &&
        typeof edge.source === 'string' &&
        typeof edge.target === 'string' &&
        known.has(edge.source) &&
        known.has(edge.target)
    )
    .map((edge) => ({ source: edge.source, target: edge.target }))

  const memory: StarmapMemoryCard[] = (graph?.memory ?? []).map((card) => ({
    source: card?.source === 'profile' ? 'profile' : 'memory',
    title: '',
    body: card?.body ?? ''
  }))

  return {
    nodes,
    edges,
    clusters: (graph?.clusters ?? []).map((cluster) => ({
      category: cluster?.category ?? '',
      count: toNumber(cluster?.count)
    })),
    memory,
    stats: graph?.stats ?? {}
  }
}

/** Their memory cards are addressed by `memory:<source>:<index>` — the index is
 * the card's position in the `memory` array, which is how the graph builder
 * mints the node id in the first place. The map's tooltip needs the body, so
 * the lookup is built once here rather than re-derived per frame. */
export function memoryById(graph: LearningGraph | undefined): Map<string, StarmapMemoryCard> {
  const byId = new Map<string, StarmapMemoryCard>()
  ;(graph?.memory ?? []).forEach((card, index) => {
    const source = card?.source === 'profile' ? 'profile' : 'memory'
    byId.set(`memory:${source}:${index}`, {
      source,
      title: '',
      body: card?.body ?? ''
    })
  })
  return byId
}

export const STARMAP_EMPTY_HINT =
  'Карта пуста: агент ещё не завёл собственных скилов и записей памяти. Она заполнится сама, когда он начнёт учиться в этом проекте.'
