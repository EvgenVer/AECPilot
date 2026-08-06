// The two behaviours this panel exists for, both from
// specs/workspace-sources.md: a folder that main answers with a warning is not
// connected until the user says so a second time, and a source that has become
// unreachable says so without being expanded.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SourcesPanel } from './SourcesPanel'
import { AecI18nProvider } from '../../shared/i18n'

const listSources = vi.fn()
const addSource = vi.fn()
const removeSource = vi.fn()
const getSourceStatus = vi.fn()
const pickProjectDirectory = vi.fn()

const source = { id: 's1', root_path: 'D:/проект/чертежи', added_at: '2026-08-06T00:00:00Z' }

beforeEach(() => {
  window.localStorage.clear()
  listSources.mockResolvedValue([source])
  getSourceStatus.mockResolvedValue({ ok: true, status: 'ok' })
  addSource.mockResolvedValue({ ok: true, sources: [source] })
  removeSource.mockResolvedValue({ ok: true })
  pickProjectDirectory.mockResolvedValue('D:/проект/новая-папка')
  window.aecpilot = {
    listSources,
    addSource,
    removeSource,
    getSourceStatus,
    pickProjectDirectory
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
  it('lists connected sources by their root path', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('D:/проект/чертежи')).toBeTruthy())
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
    await waitFor(() => expect(screen.getByText('D:/проект/чертежи')).toBeTruthy())

    await click('Подключить папку')

    expect(addSource).toHaveBeenCalledWith('D:/проект/новая-папка', false)
  })

  it('holds a warned folder until it is confirmed', async () => {
    addSource.mockResolvedValueOnce({ needsConfirm: ['папка пересекается с другим источником'] })
    renderPanel()
    await waitFor(() => expect(screen.getByText('D:/проект/чертежи')).toBeTruthy())

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
    await waitFor(() => expect(screen.getByText('D:/проект/чертежи')).toBeTruthy())

    await click('Подключить папку')
    await click('Отмена')

    expect(screen.queryByText('папка сейчас недоступна')).toBeNull()
    expect(addSource).toHaveBeenCalledTimes(1)
  })

  it('asks before disconnecting, and reports a refusal', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()
    await waitFor(() => expect(screen.getByText('D:/проект/чертежи')).toBeTruthy())

    await click('Отключить')
    expect(removeSource).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    removeSource.mockResolvedValue({ ok: false, error: 'источник занят индексацией' })
    await click('Отключить')

    expect(removeSource).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(screen.getByText('источник занят индексацией')).toBeTruthy())
  })
})
