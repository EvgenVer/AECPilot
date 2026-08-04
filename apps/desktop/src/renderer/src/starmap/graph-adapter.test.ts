import { describe, expect, it } from 'vitest'
import { memoryById, toStarmapGraph } from './graph-adapter'

describe('toStarmapGraph', () => {
  it('fills the strict fields the painter reads every frame', () => {
    const [node] = toStarmapGraph({
      nodes: [{ id: 'rebar', label: 'Армирование', timestamp: 1_780_000_000 }],
      memory: []
    }).nodes
    expect(node).toEqual({
      id: 'rebar',
      label: 'Армирование',
      kind: 'skill',
      timestamp: 1_780_000_000,
      category: 'general',
      useCount: 0,
      state: 'active',
      createdBy: null,
      pinned: false
    })
  })

  // `timestamp` is genuinely nullable in their payload and the layout has a
  // real branch for it. Substituting a date would put the node on a ring it
  // does not belong to, silently.
  it('keeps an undated node undated instead of dating it now', () => {
    const [node] = toStarmapGraph({ nodes: [{ id: 'x' }], memory: [] }).nodes
    expect(node?.timestamp).toBeNull()
  })

  it('recognises a memory node by their id scheme when kind is missing', () => {
    const { nodes } = toStarmapGraph({
      nodes: [{ id: 'memory:profile:0' }, { id: 'memory:memory:1' }],
      memory: []
    })
    expect(nodes.map((n) => [n.kind, n.memorySource])).toEqual([
      ['memory', 'profile'],
      ['memory', 'memory']
    ])
  })

  it('draws an unnamed node by its id rather than as a blank orb', () => {
    const [node] = toStarmapGraph({ nodes: [{ id: 'no-name', label: '   ' }], memory: [] }).nodes
    expect(node?.label).toBe('no-name')
  })

  it('skips a node with no usable id', () => {
    const { nodes } = toStarmapGraph({
      nodes: [{ id: '' }, { id: 'ok' }],
      memory: []
    })
    expect(nodes.map((n) => n.id)).toEqual(['ok'])
  })

  // `forceLink` throws "node not found" the moment it initialises on a dangling
  // endpoint, so this filter runs before anything else touches the data.
  it('drops an edge pointing at a node that is not in the graph', () => {
    const { edges } = toStarmapGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      memory: [],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'ghost' }
      ]
    })
    expect(edges).toEqual([{ source: 'a', target: 'b' }])
  })

  it('answers an empty graph for undefined, without throwing', () => {
    expect(toStarmapGraph(undefined)).toEqual({
      nodes: [],
      edges: [],
      clusters: [],
      memory: [],
      stats: {}
    })
  })
})

describe('memoryById', () => {
  // Their node id is `memory:<source>:<index-in-the-memory-array>`, minted by
  // the graph builder from the array position — so the lookup has to be built
  // the same way, not guessed from the body.
  it('addresses memory cards by their minted id', () => {
    const byId = memoryById({
      nodes: [],
      memory: [
        { source: 'memory', body: 'первая' },
        { source: 'profile', body: 'вторая' }
      ]
    })
    expect(byId.get('memory:memory:0')?.body).toBe('первая')
    expect(byId.get('memory:profile:1')?.body).toBe('вторая')
    expect(byId.get('memory:memory:1')).toBeUndefined()
  })
})
