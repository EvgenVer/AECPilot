// Задача 3L.9: модель карты документов и правила подсветки.

import { describe, expect, it } from 'vitest'

import type { GraphDocumentMap } from '../../../../shared/ipc'
import { REFERS_COLOR, sectionOf, toDocumentGraph } from './document-map-model'
import { edgeHidden, nodeView } from './use-graph-canvas'

const map: GraphDocumentMap = {
  edges: [
    { entities: [], kind: 'shared', source: 's/a', target: 's/b', weight: 4 },
    { code: '297-1-ИГИ', kind: 'refers', places: [], source: 's/a', target: 's/b', weight: 1 },
    { entities: [], kind: 'shared', source: 's/b', target: 's/c', weight: 1 }
  ],
  graph_exists: true,
  nodes: [
    { code: '297-КР', entities: 9, id: 's/a', label: '297-КР.pdf', rel_path: 'a', source_id: 's' },
    {
      code: '297-1-ИГИ',
      entities: 4,
      id: 's/b',
      label: 'отчёт.pdf',
      rel_path: 'b',
      source_id: 's'
    },
    { code: null, entities: 1, id: 's/c', label: 'письмо.pdf', rel_path: 'c', source_id: 's' }
  ],
  view: 'documents'
}

describe('карта документов — модель (3L.9)', () => {
  it('раздел из шифра красит документ', () => {
    expect(sectionOf('297-2024-КР')).toBe('КР')
    expect(sectionOf('297-1-ИГИ2')).toBe('ИГИ')
    expect(sectionOf(null)).toBe('')
  })

  it('общие сущности и «ссылается» — два ребра одной пары; ключ ребра — его место в ответе', () => {
    const graph = toDocumentGraph(map)

    expect(graph.order).toBe(3)
    expect(graph.size).toBe(3)
    expect(graph.getEdgeAttribute('1', 'color')).toBe(REFERS_COLOR)
    expect(graph.isDirected('1')).toBe(true)
    expect(graph.getEdgeAttribute('0', 'size')).toBe(3)
  })

  it('поиск гасит несовпавшее, наведение — всё, кроме соседей', () => {
    const graph = toDocumentGraph(map)
    const data = (node: string) => graph.getNodeAttributes(node)

    expect(nodeView(graph, 's/b', data('s/b'), 'игИ', null).highlighted).toBe(true)
    expect(nodeView(graph, 's/c', data('s/c'), 'игИ', null).label).toBe('')

    expect(nodeView(graph, 's/b', data('s/b'), '', 's/a')).toEqual(data('s/b'))
    expect(nodeView(graph, 's/c', data('s/c'), '', 's/a').label).toBe('')
    expect(edgeHidden(graph, '2', 's/a')).toBe(true)
    expect(edgeHidden(graph, '0', 's/a')).toBe(false)
  })
})
