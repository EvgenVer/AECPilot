// The «Граф» tab (3J.14). sigma needs WebGL, which jsdom has not — it is
// replaced by a stand-in that records the graph it got and lets the test click.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { GraphDocumentMap, GraphExport } from '../../../../shared/ipc'
import { $openDocument, closeAllDocuments } from '../viewers/viewer-store'

type Payload = { edge?: string; node?: string }
const handlers: Record<string, (payload: Payload) => void> = {}
const kill = vi.fn()
const refresh = vi.fn()
let drawnOrder = -1

vi.mock('sigma', () => ({
  default: class {
    constructor(graph: { order: number }) {
      drawnOrder = graph.order
    }
    on(event: string, handler: (payload: Payload) => void): void {
      handlers[event] = handler
    }
    kill = kill
    refresh = refresh
  }
}))

const { IndexGraph } = await import('./IndexGraph')

const exportGraph = vi.fn()
const exportDocumentMap = vi.fn()

const KR = '297-2024-КР Расчёт.pdf'
const IGI = 'ИГИ/297-1-ИГИ отчёт.pdf'

const documentMap = (patch: Partial<GraphDocumentMap> = {}): GraphDocumentMap => ({
  edges: [
    {
      entities: [
        {
          label: 'Грунт ИГЭ-2',
          places: [{ chunk_id: 'k2', locator: { page: 5 }, rel_path: IGI, source_id: 'tasks' }],
          type: 'грунт'
        }
      ],
      kind: 'shared',
      source: `tasks/${KR}`,
      target: `tasks/${IGI}`,
      weight: 3
    },
    {
      code: '297-1-ИГИ',
      kind: 'refers',
      places: [{ chunk_id: 'k1', locator: { page: 2 }, rel_path: KR, source_id: 'tasks' }],
      source: `tasks/${KR}`,
      target: `tasks/${IGI}`,
      weight: 1
    }
  ],
  graph_exists: true,
  nodes: [
    {
      code: '297-2024-КР',
      entities: 3,
      id: `tasks/${KR}`,
      label: '297-2024-КР Расчёт.pdf',
      rel_path: KR,
      source_id: 'tasks'
    },
    {
      code: '297-1-ИГИ',
      entities: 3,
      id: `tasks/${IGI}`,
      label: '297-1-ИГИ отчёт.pdf',
      rel_path: IGI,
      source_id: 'tasks'
    }
  ],
  view: 'documents',
  ...patch
})

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
  exportDocumentMap.mockResolvedValue({ map: documentMap(), ok: true })
  window.aecpilot = {
    exportDocumentMap,
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

/** «Сущности» — второй вид (3L.9): по умолчанию открыта карта документов. */
const renderEntities = async () => {
  renderTab()
  await waitFor(() => expect(drawnOrder).toBe(2))
  drawnOrder = -1
  fireEvent.click(screen.getByRole('button', { name: 'Сущности' }))
}

describe('IndexGraph (3J.14)', () => {
  it('рисует узлы; щелчок по сущности — её документы, документ открывается во вьюере', async () => {
    await renderEntities()
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
    await renderEntities()
    await waitFor(() => expect(drawnOrder).toBe(2))

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tasks/ИГИ/отчёт.pdf' } })

    await waitFor(() =>
      expect(exportGraph).toHaveBeenLastCalledWith({ rel: 'ИГИ/отчёт.pdf', sourceId: 'tasks' })
    )
  })

  it('пустой граф сказан прямо и ничего не рисуется', async () => {
    exportGraph.mockResolvedValue({ graph: graph({ nodes: [], total_nodes: 0 }), ok: true })
    await renderEntities()

    await waitFor(() => expect(screen.getByText(/Граф знаний пуст/)).toBeTruthy())
    expect(drawnOrder).toBe(-1)
  })

  it('часть большого графа — сказано, сколько всего', async () => {
    exportGraph.mockResolvedValue({
      graph: graph({ matched_nodes: 900, total_nodes: 1200, truncated: true }),
      ok: true
    })
    await renderEntities()

    await waitFor(() =>
      expect(screen.getByText(/Показаны 2 самых связанных сущностей из 900/)).toBeTruthy()
    )
  })
})

// Задача 3L.9: карта документов — вид по умолчанию.
describe('карта документов (3L.9)', () => {
  it('по умолчанию — документы; щелчок по документу открывает его', async () => {
    renderTab()
    await waitFor(() => expect(drawnOrder).toBe(2))
    expect(screen.getByText('Документов: 2, связей: 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Документы' }).getAttribute('aria-pressed')).toBe(
      'true'
    )

    act(() => handlers.clickNode({ node: `tasks/${KR}` }))
    expect($openDocument.get()).toMatchObject({ relPath: KR, sourceId: 'tasks' })
  })

  it('щелчок по связи — «связаны через»: общие сущности со ссылками на места', async () => {
    renderTab()
    await waitFor(() => expect(drawnOrder).toBe(2))

    act(() => handlers.clickEdge({ edge: '0' }))
    const panel = screen.getByRole('complementary', { name: 'Связаны через' })
    expect(panel.textContent).toContain('Общих сущностей: 3')
    expect(panel.textContent).toContain('Грунт ИГЭ-2')
    act(() => screen.getByRole('button', { name: '297-1-ИГИ отчёт.pdf, с. 5' }).click())
    expect($openDocument.get()).toMatchObject({
      locator: { page: 5 },
      relPath: IGI,
      sourceId: 'tasks'
    })

    act(() => handlers.clickStage({}))
    expect(screen.queryByRole('complementary', { name: 'Связаны через' })).toBeNull()
  })

  it('стрелка «ссылается» — шифр и место упоминания', async () => {
    renderTab()
    await waitFor(() => expect(drawnOrder).toBe(2))

    act(() => handlers.clickEdge({ edge: '1' }))
    expect(screen.getByText(/ссылается на «297-1-ИГИ отчёт.pdf» \(шифр 297-1-ИГИ\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '297-2024-КР Расчёт.pdf, с. 2' })).toBeTruthy()
  })

  it('поиск перерисовывает граф; «на весь экран» — слой на всё окно, Esc возвращает', async () => {
    renderTab()
    await waitFor(() => expect(drawnOrder).toBe(2))
    refresh.mockClear()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск по имени' }), {
      target: { value: 'игИ' }
    })
    expect(refresh).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'На весь экран' }))
    const layer = screen.getByRole('dialog', { name: 'Граф на всё окно' })
    expect(layer.className).toContain('fixed')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Граф на всё окно' })).toBeNull()
    expect(screen.getByRole('button', { name: 'На весь экран' })).toBeTruthy()
  })
})
