// What the indicator has to get right (tasks 2.15, 2.15a): say plainly when the
// index has fallen behind, never start a graph on its own, and show what adding
// to one would cost before it is agreed to. Задача 3H.10: подробности живут на
// странице «Индекс», значок строки состояния ведёт на неё.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { GraphAddState, IngestState, RagStatus } from '../../../../shared/ipc'

import { $dataProvidersOpen, EMPTY_STATE } from '../data-providers/store'

import { IndexDetails, IndexStatus } from './IndexStatus'

const getIndexStatus = vi.fn()
const getIngestState = vi.fn()
const startIngest = vi.fn()
const getGraphAddState = vi.fn()
const getEmbeddingSwitch = vi.fn()
const getDataProviders = vi.fn()
const cancelIngest = vi.fn()
let emitIngestState: (state: IngestState) => void = () => {}
let emitGraphState: (state: GraphAddState) => void = () => {}

const IDLE: IngestState = {
  error: null,
  files: [],
  lastReport: null,
  progress: null,
  running: false,
  stopping: false
}
const GRAPH_IDLE: GraphAddState = {
  error: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false
}

function status(patch: Partial<RagStatus> = {}): RagStatus {
  return {
    chunks_total: 480,
    files_indexed: 12,
    files_total: 12,
    graph: { chunks: 0, covers_whole_project: false, documents: 0, documents_outside: 12 },
    graph_entries: [],
    graph_pending: { chunks_estimate: 0, documents: 0, not_indexed: 0 },
    last_ingest_at: null,
    stale_count: 0,
    ...patch
  }
}

beforeEach(() => {
  window.localStorage.clear()
  getIndexStatus.mockResolvedValue({ ok: true, status: status() })
  getIngestState.mockResolvedValue(IDLE)
  startIngest.mockResolvedValue({ started: true })
  getGraphAddState.mockResolvedValue(GRAPH_IDLE)
  getEmbeddingSwitch.mockResolvedValue(null)
  getDataProviders.mockResolvedValue({ ...EMPTY_STATE, profileRead: true, rag: { ok: true } })
  window.aecpilot = {
    getDataProviders,
    getIndexStatus,
    getIngestState,
    startIngest,
    getGraphAddState,
    getEmbeddingSwitch,
    cancelIngest,
    onIngestState: (cb: (state: IngestState) => void) => {
      emitIngestState = cb
      return () => {}
    },
    onGraphAddState: (cb: (state: GraphAddState) => void) => {
      emitGraphState = cb
      return () => {}
    }
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const withProviders = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>{node}</AecI18nProvider>
    </QueryClientProvider>
  )

const renderIndicator = () => withProviders(<IndexStatus />)

/** Тело страницы «Индекс», дождавшись прочитанного состояния. */
async function renderPage(): Promise<void> {
  withProviders(<IndexDetails />)
  await waitFor(() => expect(screen.getByText('Проиндексировать')).toBeTruthy())
}

describe('IndexStatus', () => {
  it('shows how much of the project has been read', async () => {
    renderIndicator()

    await waitFor(() => expect(screen.getByText('12 / 12')).toBeTruthy())
  })

  it('says out loud when the index has fallen behind', async () => {
    // An answer built on a stale index looks exactly like an answer built on a
    // current one — this is the only place the difference is visible.
    getIndexStatus.mockResolvedValue({ ok: true, status: status({ stale_count: 3 }) })
    renderIndicator()

    await waitFor(() => expect(screen.getByText('· 3 устарело')).toBeTruthy())
  })

  it('starts an ingest when asked and never on its own', async () => {
    await renderPage()

    expect(startIngest).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByText('Проиндексировать').click()
    })

    expect(startIngest).toHaveBeenCalledTimes(1)
  })

  it('asks before rebuilding for another embedding model, names the price, touches nothing on its own (3G.7)', async () => {
    getEmbeddingSwitch.mockResolvedValue({
      from: 'text-embedding-3-large',
      to: 'gemini-embedding-2'
    })
    getIndexStatus.mockResolvedValue({
      ok: true,
      status: status({
        graph: { chunks: 40, covers_whole_project: false, documents: 2, documents_outside: 10 }
      })
    })
    await renderPage()

    const question = await screen.findByRole('alert')
    expect(question.textContent).toContain('text-embedding-3-large')
    expect(question.textContent).toContain('gemini-embedding-2')
    expect(question.textContent).toContain('480 фрагмент')
    expect(question.textContent).toContain('2 документ')
    expect(startIngest).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByText('Перестроить индекс').click()
    })

    expect(startIngest).toHaveBeenCalledWith(true, true)
  })

  it('агент по подписке без выбора — причина словами и вход в окно «Индекс и память» (3G.49)', async () => {
    const reason =
      'агент работает через «openai-codex» — выберите провайдера в окне «Индекс и память»'
    getDataProviders.mockResolvedValue({
      ...EMPTY_STATE,
      profileRead: true,
      agentProvider: 'openai-codex',
      rag: { ok: false, reason }
    })
    await renderPage()

    await screen.findByText(`У поиска по документам нет провайдера: ${reason}.`)
    await act(async () => {
      screen.getByRole('button', { name: 'Выбрать провайдера' }).click()
    })
    expect($dataProvidersOpen.get()).toBe(true)
    $dataProvidersOpen.set(false)
  })

  it('shows no rebuild question when the model did not change', async () => {
    await renderPage()

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('Перестроить индекс')).toBeNull()
  })

  it('follows a running ingest by event rather than polling', async () => {
    renderIndicator()
    await waitFor(() => expect(screen.getByText('12 / 12')).toBeTruthy())

    await act(async () => {
      emitIngestState({
        ...IDLE,
        progress: {
          chunks: 0,
          done: 4,
          error: '',
          rel_path: 'ЭОМ/задание.pdf',
          source_id: 'tasks',
          stage: 'file',
          total: 12
        },
        running: true
      })
    })

    expect(screen.getByText('индексация 4 / 12')).toBeTruthy()
  })

  it('says the graph is empty on a clean project — UR24: it is never built on its own', async () => {
    await renderPage()

    expect(screen.getByText(/Пуст\./)).toBeTruthy()
  })

  it('shows what adding the new documents of a marked folder would cost', async () => {
    getIndexStatus.mockResolvedValue({
      ok: true,
      status: status({
        graph: { chunks: 300, covers_whole_project: false, documents: 5, documents_outside: 7 },
        graph_entries: [{ added_at: '2026-08-15', kind: 'folder', path: 'tasks/ЭОМ' }],
        graph_pending: { chunks_estimate: 96, documents: 2, not_indexed: 0 }
      })
    })
    await renderPage()

    expect(screen.getByText('tasks/ЭОМ')).toBeTruthy()
    expect(screen.getByText(/2 новых документ.*96 фрагментов/)).toBeTruthy()
    expect(screen.getByText(/7 документ\(ов\) вне графа/)).toBeTruthy()
  })

  it('показывает ход графового прогона: окно подтверждения могли закрыть', async () => {
    // Задача 5.15. Уровень 2 тратит деньги минутами, а окно, из которого его
    // запустили, человек вправе закрыть. Если ход не видно здесь, расход
    // становится невидимым вовсе.
    await renderPage()

    await act(async () => {
      emitGraphState({
        ...GRAPH_IDLE,
        path: 'tasks/ЭОМ',
        progress: {
          chunks: 7,
          done: 3,
          error: '',
          rel_path: 'ЭОМ/задание.pdf',
          source_id: 'tasks',
          stage: 'graph',
          total: 12
        },
        running: true
      })
    })

    expect(screen.getByText('строю граф: 3 из 12')).toBeTruthy()
  })

  it('значок строки состояния ведёт на страницу «Индекс» (3H.10)', async () => {
    renderIndicator()
    await waitFor(() => expect(screen.getByText('12 / 12')).toBeTruthy())
    await act(async () => {
      screen.getByRole('button').click()
    })

    expect(window.location.hash).toBe('#/aec-index')
  })

  it('второй проход называет файл и страницу, «Остановить» уходит в главный процесс (3H.15, 3H.16)', async () => {
    await renderPage()

    await act(async () => {
      emitIngestState({
        ...IDLE,
        files: [
          {
            error: '',
            pagesDone: 3,
            pagesWaiting: 150,
            rel_path: 'ИГИ/297-1.pdf',
            source_id: 'tasks',
            state: 'recognizing'
          },
          {
            error: '',
            pagesDone: 0,
            pagesWaiting: 0,
            rel_path: 'ИГИ/ПЗ.docx',
            source_id: 'tasks',
            state: 'read'
          }
        ],
        progress: {
          chunks: 1,
          done: 1,
          error: '',
          page: 3,
          pages: 150,
          phase: 'ocr',
          rel_path: 'ИГИ/297-1.pdf',
          source_id: 'tasks',
          stage: 'page',
          total: 2
        },
        running: true
      })
    })

    expect(screen.getByRole('status').textContent).toBe(
      'Распознаю сканы: файл 1 из 2, страница 3 из 150'
    )
    expect(screen.getByText('распознаю: стр. 3 из 150')).toBeTruthy()
    expect(screen.getByText('прочитан')).toBeTruthy()

    await act(async () => {
      screen.getByRole('button', { name: 'Остановить' }).click()
    })
    expect(cancelIngest).toHaveBeenCalledTimes(1)
  })

  it('остановленный прогон говорит, что готовое сохранено и что продолжит (3H.16)', async () => {
    getIndexStatus.mockResolvedValue({ ok: true, status: status({ pages_pending: 147 }) })
    getIngestState.mockResolvedValue({
      ...IDLE,
      lastReport: {
        chunks: 40,
        errors: [],
        files_failed: 0,
        files_ingested: 1,
        files_skipped: 0,
        files_total: 3,
        removed_chunks: 0,
        stopped: true
      }
    })
    await renderPage()

    await waitFor(() => expect(screen.getByText(/Остановлено\. Готовое сохранено/)).toBeTruthy())
    expect(screen.getByText(/147 стр\. сканов ждут распознавания/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Остановить' })).toBeNull()
  })

  it('shows nothing at all when no project is open', async () => {
    getIndexStatus.mockResolvedValue({ ok: false, error: 'Нет открытого проекта' })
    const { container } = renderIndicator()

    await waitFor(() => expect(getIndexStatus).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
