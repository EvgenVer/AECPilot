// The rule this component exists to keep, from docs/history/specs/workspace-sources.md
// § "Детект изменений": a scan that found nothing says nothing. A toast every
// cycle would teach the user to dismiss the one that matters.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'

import { ScanWatcher } from './ScanWatcher'
import { AecI18nProvider } from '../../shared/i18n'
import type { ScanReportEnvelope } from '../../../../shared/ipc'

const notify = vi.fn()
vi.mock('../../donor/store/notifications', () => ({ notify: (input: unknown) => notify(input) }))

let emit: ((envelope: ScanReportEnvelope) => void) | undefined
const getCurrentProject = vi.fn()
const getVaultTree = vi.fn()
const fillComposer = vi.fn()

// Задача 4.13: мост до их сторов замокан целиком — он тянет клиент шлюза
// (тот же приём, что в тестах мастера первого запуска).
vi.mock('../onboarding/bridge', () => ({
  fillComposer: (text: string) => fillComposer(text),
  onProviderConfigured: () => () => {},
  openProviderSetup: () => {}
}))

/** Дерево vault с одной содержательной страницей вики. */
const WIKI_TREE = [
  {
    children: [{ name: 'ТП-1.md', path: 'wiki/entities/ТП-1.md', type: 'file' as const }],
    name: 'entities',
    path: 'wiki/entities',
    type: 'dir' as const
  }
]

const envelope = (
  vaultPath: string,
  source: Partial<ScanReportEnvelope['report']['sources'][string]> = {}
): ScanReportEnvelope => ({
  vaultPath,
  report: {
    sources: {
      s1: {
        added: [],
        changed: [],
        deleted: [],
        unchanged: 12,
        root_unavailable: false,
        ...source
      }
    }
  }
})

beforeEach(() => {
  window.localStorage.clear()
  emit = undefined
  getCurrentProject.mockResolvedValue({ name: 'Объект-X', vaultPath: 'D:/vault' })
  getVaultTree.mockResolvedValue([])
  window.aecpilot = {
    getCurrentProject,
    getVaultTree,
    onScanReport: (cb: (envelope: ScanReportEnvelope) => void) => {
      emit = cb
      return () => {}
    }
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const mount = () =>
  render(
    <AecI18nProvider>
      <ScanWatcher />
    </AecI18nProvider>
  )

describe('ScanWatcher', () => {
  it('says nothing when a scan found no changes', async () => {
    mount()
    await act(async () => {
      emit?.(envelope('D:/vault'))
    })
    expect(notify).not.toHaveBeenCalled()
  })

  it('reports what moved, per source', async () => {
    mount()
    await act(async () => {
      emit?.(envelope('D:/vault', { added: ['а.pdf', 'б.pdf'], deleted: ['в.pdf'] }))
    })

    await waitFor(() => expect(notify).toHaveBeenCalled())
    const input = notify.mock.calls[0][0] as { title: string; message: string }
    expect(input.title).toBe('Источники изменились')
    expect(input.message).toContain('добавлено 2')
    expect(input.message).toContain('удалено 1')
    // Unchanged files are not news.
    expect(input.message).not.toContain('12')
  })

  it('drops a report that belongs to a project the user has left', async () => {
    mount()
    await act(async () => {
      emit?.(envelope('D:/другой-проект', { added: ['а.pdf'] }))
    })

    // A scan is tagged with the vault it started against; this one finished
    // after a switch and must not be shown over the new project.
    await waitFor(() => expect(getCurrentProject).toHaveBeenCalled())
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('предложение обновить вики (задача 4.13)', () => {
  it('вики не построена — кнопки нет', async () => {
    mount()
    await act(async () => {
      emit?.(envelope('D:/vault', { changed: ['а.pdf'] }))
    })

    await waitFor(() => expect(notify).toHaveBeenCalled())
    // Кнопка, предлагающая обновить то, чего нет, — это кнопка, которая врёт.
    expect(notify.mock.calls[0][0].action).toBeUndefined()
  })

  it('вики построена — кнопка кладёт команду в поле ввода, а не отправляет', async () => {
    getVaultTree.mockResolvedValue(WIKI_TREE)
    mount()
    await act(async () => {
      emit?.(envelope('D:/vault', { changed: ['а.pdf'] }))
    })

    await waitFor(() => expect(notify.mock.calls[0][0].action).toBeDefined())
    const action = notify.mock.calls[0][0].action

    expect(action.label).toBe('Обновить вики')
    action.onClick()
    // Заготовка, а не отправка: команда видна человеку до того, как уйдёт, и
    // не влезает в идущий ход агента (SPEC UR6).
    expect(fillComposer).toHaveBeenCalledWith('Обнови вики проекта по изменениям')
  })
})
