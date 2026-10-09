import { describe, expect, it } from 'vitest'

import type { GraphExport } from '../../../../shared/ipc'
import { nodeSize, toGraphology, typeColor } from './graph-model'

const data: GraphExport = {
  documents: [],
  edges: [
    { label: 'заказывает', source: 'Заказчик', target: 'Свая', weight: 2 },
    { label: 'обратно', source: 'Свая', target: 'Заказчик', weight: 1 },
    { label: 'за пределом', source: 'Заказчик', target: 'Нет такой', weight: 1 }
  ],
  graph_exists: true,
  matched_nodes: 2,
  nodes: [
    {
      degree: 3,
      description: '',
      documents: [],
      id: 'Заказчик',
      label: 'Заказчик',
      type: 'organization',
      x: 0.5,
      y: -0.2
    },
    {
      degree: 1,
      description: '',
      documents: [],
      id: 'Свая',
      label: 'Свая',
      type: 'equipment',
      x: -0.5,
      y: 0.1
    }
  ],
  total_edges: 3,
  total_nodes: 3,
  truncated: true
}

describe('toGraphology (3J.14)', () => {
  it('узлы с координатами Python, цвет по типу, размер по связям', () => {
    const graph = toGraphology(data)

    expect(graph.order).toBe(2)
    expect(graph.getNodeAttributes('Заказчик')).toMatchObject({
      color: typeColor('organization'),
      label: 'Заказчик',
      size: nodeSize(3),
      x: 0.5,
      y: -0.2
    })
  })

  it('ребро к узлу за пределом и повтор в обратную сторону — пропускаются', () => {
    const graph = toGraphology(data)

    expect(graph.size).toBe(1)
    expect(graph.getEdgeAttribute(graph.edge('Заказчик', 'Свая'), 'label')).toBe('заказывает')
  })

  it('тип сохраняет цвет; размер растёт со степенью', () => {
    expect(typeColor('organization')).toBe(typeColor('organization'))
    expect(nodeSize(9)).toBeGreaterThan(nodeSize(1))
  })
})
