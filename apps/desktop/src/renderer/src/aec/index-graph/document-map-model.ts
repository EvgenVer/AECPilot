// The map of documents as a graphology graph (task 3L.9). No coordinates come
// from Python: the nodes start on a spiral and d3-force lays them out live.

import Graph from 'graphology'

import type { GraphDocumentMap } from '../../../../shared/ipc'
import { typeColor } from './graph-model'

/** «ссылается» is drawn apart from «общие сущности»: an arrow of its own colour. */
export const REFERS_COLOR = '#e8833a'

/** The section of a code — «297-2024-КР» → «КР»; a document colours by it. */
export function sectionOf(code: null | string): string {
  const match = code ? /-([А-ЯЁ]{2,5})\d*(?:\.\d+)*$/.exec(code) : null
  return match ? match[1] : ''
}

/** Edge keys are positions in `map.edges`: a click on an edge finds its link. */
export function toDocumentGraph(map: GraphDocumentMap): Graph {
  const graph = new Graph({ multi: true, type: 'mixed' })
  map.nodes.forEach((node, index) => {
    const radius = 10 * Math.sqrt(index + 0.5)
    const angle = index * 2.39996
    graph.addNode(node.id, {
      code: node.code ?? '',
      color: typeColor(sectionOf(node.code) || 'документ'),
      label: node.label,
      size: Math.min(20, 4 + Math.sqrt(node.entities)),
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    })
  })
  map.edges.forEach((edge, index) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    if (edge.kind === 'refers') {
      graph.addDirectedEdgeWithKey(String(index), edge.source, edge.target, {
        color: REFERS_COLOR,
        size: 2,
        type: 'arrow'
      })
    } else {
      graph.addUndirectedEdgeWithKey(String(index), edge.source, edge.target, {
        size: Math.min(6, 1 + Math.log2(edge.weight))
      })
    }
  })
  return graph
}
