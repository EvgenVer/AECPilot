// Task 1.6.B7.10 — the ported d3-force layout.
//
// The determinism this file pins is not an accident of the test: d3-force 3.x
// seeds its own LCG (`simulation.randomSource`) instead of reaching for
// `Math.random`, and the donor gives every node an explicit start position
// derived from `hash(id)` rather than letting d3 phyllotaxis-place it. Both
// together mean a graph lays out the same way every time it is opened — which
// is what stops the map reshuffling itself under the user between visits. If
// either ever changes, this file is where it shows.
//
// The simulation is stopped IMMEDIATELY after building and stepped by hand:
// `forceSimulation` starts a `d3-timer` on construction, and in this
// environment that falls back to `setTimeout` — a live timer left running past
// the test is both non-deterministic and a leak.

import { describe, expect, it } from 'vitest'
import { buildSimulation } from './simulation'
import { RING_INNER, RING_OUTER } from './constants'
import { fitViewport } from './geometry'
import type { StarmapGraph, StarmapNode } from './graph-types'

const DAY = 86_400
const BASE = 1_700_000_000

function node(
  id: string,
  timestamp: number | null,
  kind: 'skill' | 'memory' = 'skill'
): StarmapNode {
  return {
    id,
    label: id,
    kind,
    timestamp,
    category: 'general',
    useCount: 0,
    state: 'active',
    createdBy: null,
    pinned: false
  }
}

/** Twelve nodes, five days apart — enough for the bucketer to pick a real
 * calendar interval rather than falling back to the even layout. */
function datedGraph(edges: { source: string; target: string }[] = []): StarmapGraph {
  return {
    nodes: Array.from({ length: 12 }, (_, i) => node(`n${i}`, BASE + i * 5 * DAY)),
    edges,
    clusters: [],
    memory: [],
    stats: {}
  }
}

/** Builds and settles a layout without ever letting its timer run. */
function settle(graph: StarmapGraph, ticks = 300): ReturnType<typeof buildSimulation> {
  const built = buildSimulation(graph, () => {})
  built.sim.stop()
  built.sim.tick(ticks)
  return built
}

describe('buildSimulation', () => {
  it('lays the same graph out identically every time', () => {
    const first = settle(datedGraph())
    const second = settle(datedGraph())
    expect(first.nodes.map((n) => [n.id, n.x, n.y])).toEqual(
      second.nodes.map((n) => [n.id, n.x, n.y])
    )
  })

  it('settles every node inside the disk, and inside the viewport it is fitted to', () => {
    const { nodes } = settle(datedGraph())
    expect(nodes).toHaveLength(12)

    for (const n of nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
      expect(Math.hypot(n.x, n.y)).toBeLessThanOrEqual(RING_OUTER)
    }

    // The camera fits RING_OUTER into the canvas, so a settled node must
    // project onto real pixels — a node laid out off-screen is a node the user
    // never sees.
    const w = 1200
    const h = 800
    const vp = fitViewport(w, h)
    for (const n of nodes) {
      const px = n.x * vp.k + vp.x
      const py = n.y * vp.k + vp.y
      expect(px).toBeGreaterThanOrEqual(0)
      expect(px).toBeLessThanOrEqual(w)
      expect(py).toBeGreaterThanOrEqual(0)
      expect(py).toBeLessThanOrEqual(h)
    }
  })

  it('puts old content near the core and new content at the rim', () => {
    const { nodes } = settle(datedGraph())
    const oldest = nodes.find((n) => n.id === 'n0')
    const newest = nodes.find((n) => n.id === 'n11')
    const rOldest = Math.hypot(oldest?.x ?? 0, oldest?.y ?? 0)
    const rNewest = Math.hypot(newest?.x ?? 0, newest?.y ?? 0)
    expect(rOldest).toBeGreaterThanOrEqual(RING_INNER * 0.9)
    expect(rNewest).toBeGreaterThan(rOldest)
  })

  it('dates its rings from the data', () => {
    const { rings } = settle(datedGraph())
    expect(rings.length).toBeGreaterThanOrEqual(2)
    expect(rings.every((ring) => ring.label !== null && ring.label !== '')).toBe(true)
    // Rings grow outward, and the outermost is the disk edge.
    const radii = rings.map((ring) => ring.r)
    expect([...radii].sort((a, b) => a - b)).toEqual(radii)
    expect(radii.at(-1)).toBeCloseTo(RING_OUTER)
  })

  // An edge whose endpoint is not a node would make d3-force throw
  // ("node not found") the moment `forceLink` initialises.
  it('drops an edge that points at a node the graph does not have', () => {
    const { links } = settle(
      datedGraph([
        { source: 'n0', target: 'n1' },
        { source: 'n2', target: 'ghost' }
      ])
    )
    expect(links).toHaveLength(1)
  })

  // Required by the spec: a node with no links is still on the map.
  it('lays out a node that has no links at all', () => {
    const { byId } = settle(datedGraph([{ source: 'n0', target: 'n1' }]))
    const lonely = byId.get('n7')
    expect(lonely).toBeDefined()
    expect(Number.isFinite(lonely?.x)).toBe(true)
  })

  // A fresh project's graph is empty by design (spec §Факт 9).
  it('survives an empty graph without throwing', () => {
    const built = settle({ nodes: [], edges: [], clusters: [], memory: [], stats: {} })
    expect(built.nodes).toEqual([])
    expect(built.links).toEqual([])
    expect(built.rings.length).toBeGreaterThan(0) // the even-layout fallback
  })

  // Undated nodes are rare but real, and they must not collapse onto one point.
  it('spreads an undated graph by ordinal position instead of stacking it', () => {
    const { nodes } = settle({
      nodes: [node('a', null), node('b', null), node('c', null)],
      edges: [],
      clusters: [],
      memory: [],
      stats: {}
    })
    const radii = nodes.map((n) => Math.hypot(n.x, n.y))
    expect(new Set(radii.map((r) => r.toFixed(2))).size).toBeGreaterThan(1)
  })
})
