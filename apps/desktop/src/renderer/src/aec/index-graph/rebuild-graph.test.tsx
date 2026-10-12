// «Перестроить граф» (задача 3L.7): сначала цена, прогон — только по согласию.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'
import type { GraphAddState, GraphPreview } from '../../../../shared/ipc'
import { RebuildGraph } from './RebuildGraph'

const previewGraphRebuild = vi.fn()
const startGraphRebuild = vi.fn()
let emit: (state: GraphAddState) => void = () => {}

const IDLE: GraphAddState = {
  error: null,
  failure: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false
}

const preview = (patch: Partial<GraphPreview> = {}): GraphPreview => ({
  adds: [],
  chunks_estimate: 120,
  documents: 4,
  entries: [{ added_at: 'x', kind: 'folder', path: 'tasks/КР' }],
  index_missing: false,
  not_indexed: 0,
  ...patch
})

beforeEach(() => {
  previewGraphRebuild.mockResolvedValue({ ok: true, preview: preview() })
  startGraphRebuild.mockResolvedValue({ started: true })
  window.aecpilot = {
    getGraphAddState: () => Promise.resolve(IDLE),
    onGraphAddState: (cb: (state: GraphAddState) => void) => {
      emit = cb
      return () => {}
    },
    previewGraphRebuild,
    startGraphRebuild
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const renderButton = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AecI18nProvider>
        <RebuildGraph />
      </AecI18nProvider>
    </QueryClientProvider>
  )

describe('RebuildGraph (3L.7)', () => {
  it('цена до прогона; «Отмена» ничего не запускает', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Перестроить граф' }))

    await waitFor(() => expect(screen.getByText(/4 документ\(ов\), примерно 120/)).toBeTruthy())
    expect(startGraphRebuild).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(startGraphRebuild).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Перестроить граф' })).toBeTruthy()
  })

  it('согласие запускает перестройку; ход и итог — из состояния прогона', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Перестроить граф' }))
    const confirm = await screen.findByRole('button', { name: 'Перестроить' })
    await act(async () => {
      fireEvent.click(confirm)
    })
    expect(startGraphRebuild).toHaveBeenCalledTimes(1)

    act(() => emit({ ...IDLE, progress: { done: 1, total: 4 } as never, running: true }))
    expect(screen.getByText('Строю граф: 1 из 4')).toBeTruthy()

    const report = { chunks: 120, documents_added: 4, errors: [], failed: 0 } as never
    act(() => emit({ ...IDLE, lastReport: report }))
    expect(screen.getByText(/Готово: добавлено 4 документ/)).toBeTruthy()
  })

  it('ничего не отмечено — перестраивать нечего, кнопки согласия нет', async () => {
    previewGraphRebuild.mockResolvedValue({
      ok: true,
      preview: preview({ chunks_estimate: 0, documents: 0, entries: [] })
    })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Перестроить граф' }))

    await waitFor(() => expect(screen.getByText(/Перестраивать нечего/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Перестроить' })).toBeNull()
  })
})
