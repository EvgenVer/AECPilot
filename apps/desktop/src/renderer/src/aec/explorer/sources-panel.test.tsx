// The two behaviours this panel exists for, both from
// specs/workspace-sources.md: a folder that main answers with a warning is not
// connected until the user says so a second time, and a source that has become
// unreachable says so without being expanded.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SourcesPanel } from './SourcesPanel'
import { AecI18nProvider } from '../../shared/i18n'
import type { GraphAddState, GraphPreview } from '../../../../shared/ipc'

import { closeGraphAdd } from './graph-add-store'

const listSources = vi.fn()
const addSource = vi.fn()
const removeSource = vi.fn()
const renameSource = vi.fn()
const showSourceEntryInExplorer = vi.fn()
const getSourceStatus = vi.fn()
const pickProjectDirectory = vi.fn()
const getConnection = vi.fn()
const getSourceTree = vi.fn()
const previewGraphAdd = vi.fn()
const startGraphAdd = vi.fn()
const getGraphAddState = vi.fn()
let emitGraphState: (state: GraphAddState) => void = () => {}

const source = { id: 's1', root_path: 'D:/проект/чертежи', added_at: '2026-08-06T00:00:00Z' }

const GRAPH_IDLE: GraphAddState = {
  error: null,
  failure: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false
}

function preview(patch: Partial<GraphPreview> = {}): GraphPreview {
  return {
    adds: [{ added_at: '2026-09-09', kind: 'folder', path: 's1' }],
    chunks_estimate: 96,
    documents: 2,
    entries: [{ added_at: '2026-09-09', kind: 'folder', path: 's1' }],
    index_missing: false,
    not_indexed: 0,
    ...patch
  }
}

beforeEach(() => {
  window.localStorage.clear()
  listSources.mockResolvedValue([source])
  getSourceStatus.mockResolvedValue({ ok: true, status: 'ok' })
  addSource.mockResolvedValue({ ok: true, sources: [source] })
  removeSource.mockResolvedValue({ ok: true })
  pickProjectDirectory.mockResolvedValue('D:/проект/новая-папка')
  getConnection.mockResolvedValue({ mode: 'local' })
  getSourceTree.mockResolvedValue({
    ok: true,
    status: 'ok',
    tree: [
      {
        name: 'ЭОМ',
        path: 'ЭОМ',
        type: 'dir',
        children: [{ name: 'задание.pdf', path: 'ЭОМ/задание.pdf', type: 'file' }]
      }
    ]
  })
  previewGraphAdd.mockResolvedValue({ ok: true, preview: preview() })
  startGraphAdd.mockResolvedValue({ started: true })
  getGraphAddState.mockResolvedValue(GRAPH_IDLE)
  window.aecpilot = {
    listSources,
    getConnection,
    addSource,
    removeSource,
    renameSource,
    showSourceEntryInExplorer,
    getSourceStatus,
    pickProjectDirectory,
    getSourceTree,
    previewGraphAdd,
    startGraphAdd,
    getGraphAddState,
    onGraphAddState: (cb: (state: GraphAddState) => void) => {
      emitGraphState = cb
      return () => {}
    }
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  // Цель отметки живёт в сторе, а не в DOM: без сброса следующий тест начался бы
  // с открытым окном подтверждения.
  closeGraphAdd()
})

const renderPanel = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <SourcesPanel />
      </AecI18nProvider>
    </QueryClientProvider>
  )

const click = async (name: string) => {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
}

describe('SourcesPanel', () => {
  it('lists connected sources by their folder name, full path in the tooltip (3J.5)', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())
    expect(screen.queryByText('недоступен')).toBeNull()
  })

  it('marks a source that is no longer reachable', async () => {
    getSourceStatus.mockResolvedValue({ ok: true, status: 'unavailable' })
    renderPanel()
    await waitFor(() => expect(screen.getByText('недоступен')).toBeTruthy())
  })

  it('treats a failed status check as unreachable too', async () => {
    getSourceStatus.mockResolvedValue({ ok: false, error: 'сетевой путь не найден' })
    renderPanel()
    await waitFor(() => expect(screen.getByText('недоступен')).toBeTruthy())
  })

  it('connects a picked folder', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await click('Подключить папку')

    expect(addSource).toHaveBeenCalledWith('D:/проект/новая-папка', false)
  })

  it('holds a warned folder until it is confirmed', async () => {
    addSource.mockResolvedValueOnce({ needsConfirm: ['папка пересекается с другим источником'] })
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await click('Подключить папку')

    // Not connected yet — the warning is on screen and the second call has not
    // happened.
    expect(screen.getByText('папка пересекается с другим источником')).toBeTruthy()
    expect(addSource).toHaveBeenCalledTimes(1)

    await click('Подключить всё равно')

    // Same path, now confirmed.
    expect(addSource).toHaveBeenLastCalledWith('D:/проект/новая-папка', true)
  })

  it('drops a warned folder when the user backs out', async () => {
    addSource.mockResolvedValueOnce({ needsConfirm: ['папка сейчас недоступна'] })
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await click('Подключить папку')
    await click('Отмена')

    expect(screen.queryByText('папка сейчас недоступна')).toBeNull()
    expect(addSource).toHaveBeenCalledTimes(1)
  })

  it('asks before disconnecting, and reports a refusal', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await click('Отключить')
    expect(removeSource).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    removeSource.mockResolvedValue({ ok: false, error: 'источник занят индексацией' })
    await click('Отключить')

    expect(removeSource).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(screen.getByText('источник занят индексацией')).toBeTruthy())
  })
})

// Задача 5.15 — отметка в граф из проводника. Проверяется то, что требует
// SPECIFICATION UR24: объём и стоимость названы ДО запуска, а отказ не
// запускает ничего.
describe('добавление в граф', () => {
  const openMenuOn = async (title: string) => {
    const row = screen.getByTitle(title).closest('div') as HTMLElement
    await act(async () => {
      fireEvent.contextMenu(row)
    })
  }

  const chooseAddToGraph = async () => {
    await act(async () => {
      screen.getByRole('menuitem', { name: 'Добавить в граф знаний' }).click()
    })
  }

  const expand = async () => {
    await act(async () => {
      screen.getByTitle('D:/проект/чертежи').click()
    })
  }

  it('показывает объём и стоимость до запуска', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await openMenuOn('D:/проект/чертежи')
    await chooseAddToGraph()

    // Корень источника — тоже единица выбора: путь от корня пустой.
    await waitFor(() => expect(previewGraphAdd).toHaveBeenCalledWith('s1', '', 'folder'))
    expect(await screen.findByText(/2 документ.*примерно 96 фрагмент/)).toBeTruthy()
    // Ничего не запущено: прогноз — это вопрос, а не действие.
    expect(startGraphAdd).not.toHaveBeenCalled()
  })

  it('отказ не запускает ничего', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await openMenuOn('D:/проект/чертежи')
    await chooseAddToGraph()
    await screen.findByText(/2 документ/)

    await act(async () => {
      screen.getByRole('button', { name: 'Закрыть' }).click()
    })

    expect(startGraphAdd).not.toHaveBeenCalled()
    expect(screen.queryByText(/2 документ/)).toBeNull()
  })

  it('согласие запускает прогон по тому же пути', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())
    await expand()
    // Папка источника тоже открывается щелчком: дерево показывает свой уровень.
    await waitFor(() => expect(screen.getByTitle('ЭОМ')).toBeTruthy())
    await act(async () => {
      screen.getByTitle('ЭОМ').click()
    })
    await waitFor(() => expect(screen.getByText('задание.pdf')).toBeTruthy())

    await openMenuOn('ЭОМ/задание.pdf')
    await chooseAddToGraph()
    await screen.findByText(/2 документ/)

    await act(async () => {
      screen.getByRole('button', { name: 'Добавить' }).click()
    })

    // Вид записи взят из дерева, а не угадан по расширению.
    expect(previewGraphAdd).toHaveBeenCalledWith('s1', 'ЭОМ/задание.pdf', 'file')
    expect(startGraphAdd).toHaveBeenCalledWith('s1', 'ЭОМ/задание.pdf', 'file')

    await act(async () => {
      emitGraphState({
        ...GRAPH_IDLE,
        path: 's1/ЭОМ/задание.pdf',
        progress: {
          chunks: 7,
          done: 1,
          error: '',
          rel_path: 'ЭОМ/задание.pdf',
          source_id: 's1',
          stage: 'graph',
          total: 2
        },
        running: true
      })
    })

    expect(screen.getByText('Строю граф: 1 из 2')).toBeTruthy()
  })

  it('без индекса соглашаться не на что — кнопки запуска нет', async () => {
    previewGraphAdd.mockResolvedValue({
      ok: true,
      preview: preview({ adds: [], chunks_estimate: 0, documents: 0, index_missing: true })
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await openMenuOn('D:/проект/чертежи')
    await chooseAddToGraph()

    expect(await screen.findByText(/не проиндексированы/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Добавить' })).toBeNull()
  })

  it('несостоявшийся прогноз виден словами, а не пустым окном', async () => {
    previewGraphAdd.mockResolvedValue({
      ok: false,
      error: 'aec-rag graph-preview не ответил вовремя'
    })
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())

    await openMenuOn('D:/проект/чертежи')
    await chooseAddToGraph()

    expect(await screen.findByText(/не ответил вовремя/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Добавить' })).toBeNull()
  })
})

// Задача 3.13b. Источники читают наши расширения, а их запускает ядро: при
// удалённом ядре они живут там же. Здешний список к его работе не относится.
describe('ядро на другой машине', () => {
  it('вместо списка — объяснение, и за списком не ходим', async () => {
    getConnection.mockResolvedValue({ mode: 'remote' })

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AecI18nProvider>
          <SourcesPanel />
        </AecI18nProvider>
      </QueryClientProvider>
    )

    expect(await screen.findByText(/Источники — на машине ядра/)).toBeTruthy()
    expect(listSources).not.toHaveBeenCalled()
  })
})

describe('название и папка источника (3J.5–3J.6)', () => {
  it('источник с названием показан названием', async () => {
    listSources.mockResolvedValue([{ ...source, label: 'Чертежи КР' }])
    renderPanel()
    await waitFor(() => expect(screen.getByText('Чертежи КР')).toBeTruthy())
    expect(screen.getByTitle('D:/проект/чертежи')).toBeTruthy()
  })

  it('значок открывает саму папку источника', async () => {
    showSourceEntryInExplorer.mockResolvedValue({ ok: true })
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())
    await click('Открыть в проводнике')
    expect(showSourceEntryInExplorer).toHaveBeenCalledWith('s1', '')
  })

  it('«Переименовать» правит название в строке и сохраняет по Enter', async () => {
    renameSource.mockResolvedValue({ ok: true, sources: [{ ...source, label: 'ИГИ' }] })
    renderPanel()
    await waitFor(() => expect(screen.getByText('чертежи')).toBeTruthy())
    await act(async () => {
      fireEvent.contextMenu(screen.getByTitle('D:/проект/чертежи').closest('div') as HTMLElement)
    })
    await act(async () => {
      screen.getByRole('menuitem', { name: 'Переименовать' }).click()
    })
    const input = await screen.findByRole('textbox', {
      name: 'Название источника (папка на диске не переименовывается)'
    })
    fireEvent.change(input, { target: { value: 'ИГИ' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(renameSource).toHaveBeenCalledWith('s1', 'ИГИ')
  })
})
