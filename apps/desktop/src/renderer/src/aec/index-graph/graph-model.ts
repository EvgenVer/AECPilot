// The export of `aec-rag graph-export` as a graphology graph (task 3J.14).
// Coordinates come from Python (`networkx.spring_layout`); here only size,
// colour and label are chosen, so the picture is the same on every open.

import Graph from 'graphology'

import type { GraphExport } from '../../../../shared/ipc'

/** Colours by entity type: a type keeps its colour from one open to the next. */
const PALETTE = [
  '#4f8ef7',
  '#e8833a',
  '#3bb273',
  '#d64a8c',
  '#8b6fd6',
  '#c9a227',
  '#2fb3c4',
  '#a35a3c'
]

export function typeColor(type: string): string {
  let hash = 0
  for (const char of type) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/** A node grows with the square root of its links: hubs stand out, leaves stay visible. */
export function nodeSize(degree: number): number {
  return 3 + 2 * Math.sqrt(degree)
}

export function toGraphology(data: GraphExport): Graph {
  const graph = new Graph({ multi: false, type: 'undirected' })
  for (const node of data.nodes) {
    graph.addNode(node.id, {
      color: typeColor(node.type),
      label: node.label,
      size: nodeSize(node.degree),
      x: node.x,
      y: node.y
    })
  }
  for (const edge of data.edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
    if (graph.hasEdge(edge.source, edge.target)) continue
    graph.addEdge(edge.source, edge.target, {
      label: edge.label,
      size: Math.min(4, 0.5 + edge.weight / 2)
    })
  }
  return graph
}
