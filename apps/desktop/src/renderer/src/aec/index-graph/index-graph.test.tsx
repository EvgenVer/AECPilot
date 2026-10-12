// The «Граф» tab (3J.14). sigma needs WebGL, which jsdom has not — it is
// replaced by a stand-in that records the graph it got and lets the test click.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { GraphExport } from '../../../../shared/ipc'
import { $openDocument, closeAllDocuments } from '../viewers/viewer-store'

const handlers: Record<string, (payload: { node?: string }) => void> = {}
const kill = vi.fn()
let drawnOrder = -1

vi.mock('sigma', () => ({
  default: class {
    constructor(graph: { order: number }) {
      drawnOrder = graph.order
    }
    on(event: string, handler: (payload: { node?: string }) => void): void {
      handlers[event] = handler
    }
    kill = kill
  }
}))

const { IndexGraph } = await import('./IndexGraph')

const exportGraph = vi.fn()

const graph = (patch: Partial<GraphExport> = {}): GraphExport => ({
  documents: [
    { entities: 2, rel_path: 'ИГИ/отчёт.pdf', source_id: 'tasks' },
    { entities: 1, rel_path: 'ТЗ.docx', source_id: 'tasks' }
  ],
  edges: [{ label: 'заказывает', source: 'Заказчик', target: 'Свая С-1', weight: 1 }],
  graph_exists: true,
  matched_nodes: 2,
  nodes: [
    {
      degree: 1,
      description: 'Заказчик проекта',
      documents: [
        { rel_path: 'ТЗ.docx', source_id: 'tasks' },
        { rel_path: 'ИГИ/отчёт.pdf', source_id: 'tasks' }
      ],
      id: 'Заказчик',
      label: 'Заказчик',
      type: 'organization',
      x: 0,
      y: 0
    },
    {
      degree: 1,
      description: '',
      documents: [{ rel_path: 'ИГИ/отчёт.pdf', source_id: 'tasks' }],
      id: 'Свая С-1',
      label: 'Свая С-1',
      type: 'equipment',
      x: 1,
      y: 1
    }
  ],
  total_edges: 1,
  total_nodes: 2,
  truncated: false,
  ...patch
})

beforeEach(() => {
  window.localStorage.clear()
  drawnOrder = -1
  exportGraph.mockResolvedValue({ graph: graph(), ok: true })
  window.aecpilot = {
    exportGraph,
    // «Перестроить граф» (3L.7) читает состояние графового прогона.
    getGraphAddState: () => Promise.resolve({ running: false }),
    onGraphAddState: () => () => {}
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  closeAllDocuments()
})

const renderTab = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <IndexGraph />
      </AecI18nProvider>
    </QueryClientProvider>
  )

describe('IndexGraph (3J.14)', () => {
  it('рисует узлы; щелчок по сущности — её документы, документ открывается во вьюере', async () => {
    renderTab()
    await waitFor(() => expect(drawnOrder).toBe(2))
    expect(screen.getByText('Сущностей: 2, связей: 1')).toBeTruthy()

    act(() => handlers.clickNode({ node: 'Заказчик' }))
    expect(screen.getByText('Заказчик проекта')).toBeTruthy()
    act(() => screen.getByRole('button', { name: 'ТЗ.docx' }).click())
    expect($openDocument.get()).toMatchObject({ relPath: 'ТЗ.docx', sourceId: 'tasks' })

    act(() => handlers.clickStage({}))
    expect(screen.queryByText('Заказчик проекта')).toBeNull()
  })

  it('фильтр по документу просит у main только его сущности', async () => {
    renderTab()
    await waitFor(() => expect(drawnOrder).toBe(2))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tasks/ИГИ/отчёт.pdf' } })

    await waitFor(() =>
      expect(exportGraph).toHaveBeenLastCalledWith({ rel: 'ИГИ/отчёт.pdf', sourceId: 'tasks' })
    )
  })

  it('пустой граф сказан прямо и ничего не рисуется', async () => {
    exportGraph.mockResolvedValue({ graph: graph({ nodes: [], total_nodes: 0 }), ok: true })
    renderTab()

    await waitFor(() => expect(screen.getByText(/Граф знаний пуст/)).toBeTruthy())
    expect(drawnOrder).toBe(-1)
  })

  it('часть большого графа — сказано, сколько всего', async () => {
    exportGraph.mockResolvedValue({
      graph: graph({ matched_nodes: 900, total_nodes: 1200, truncated: true }),
      ok: true
    })
    renderTab()

    await waitFor(() =>
      expect(screen.getByText(/Показаны 2 самых связанных сущностей из 900/)).toBeTruthy()
    )
  })
})
