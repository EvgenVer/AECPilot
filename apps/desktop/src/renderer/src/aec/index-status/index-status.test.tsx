// What the indicator has to get right (tasks 2.15, 2.15a): say plainly when the
// index has fallen behind, never start a graph on its own, and show what adding
// to one would cost before it is agreed to.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { IngestState, RagStatus } from '../../../../shared/ipc'

import { IndexStatus } from './IndexStatus'

const getIndexStatus = vi.fn()
const getIngestState = vi.fn()
const startIngest = vi.fn()
let emitIngestState: (state: IngestState) => void = () => {}

const IDLE: IngestState = { error: null, lastReport: null, progress: null, running: false }

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

// Radix's popover measures its trigger, and jsdom has no ResizeObserver. A
// no-op is honest here: nothing in these tests depends on a measured size.
class NoopResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

beforeEach(() => {
  globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver
  window.localStorage.clear()
  getIndexStatus.mockResolvedValue({ ok: true, status: status() })
  getIngestState.mockResolvedValue(IDLE)
  startIngest.mockResolvedValue({ started: true })
  window.aecpilot = {
    getIndexStatus,
    getIngestState,
    startIngest,
    onIngestState: (cb: (state: IngestState) => void) => {
      emitIngestState = cb
      return () => {}
    }
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderIndicator = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <IndexStatus />
      </AecI18nProvider>
    </QueryClientProvider>
  )

async function openPanel(): Promise<void> {
  await waitFor(() => expect(screen.getByRole('button')).toBeTruthy())
  await act(async () => {
    screen.getByRole('button').click()
  })
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
    renderIndicator()
    await openPanel()

    expect(startIngest).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByText('Проиндексировать').click()
    })

    expect(startIngest).toHaveBeenCalledTimes(1)
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
    renderIndicator()
    await openPanel()

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
    renderIndicator()
    await openPanel()

    expect(screen.getByText('tasks/ЭОМ')).toBeTruthy()
    expect(screen.getByText(/2 новых документ.*96 фрагментов/)).toBeTruthy()
    expect(screen.getByText(/7 документ\(ов\) вне графа/)).toBeTruthy()
  })

  it('shows nothing at all when no project is open', async () => {
    getIndexStatus.mockResolvedValue({ ok: false, error: 'Нет открытого проекта' })
    const { container } = renderIndicator()

    await waitFor(() => expect(getIndexStatus).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
