// What matters about the explorer is not that it draws a tree — it is that
// every action goes through main with the right arguments, and that a failed
// one says so instead of silently doing nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { VaultExplorer } from './VaultExplorer'
import { AecI18nProvider } from '../../shared/i18n'
import type { VaultTreeNode } from '../../../../shared/ipc'

const tree: VaultTreeNode[] = [
  {
    name: 'docs',
    path: 'docs',
    type: 'dir',
    children: [{ name: 'заметка.md', path: 'docs/заметка.md', type: 'file' }]
  },
  { name: 'AGENTS.md', path: 'AGENTS.md', type: 'file' }
]

const getVaultTree = vi.fn()
const showVaultEntryInExplorer = vi.fn()
const createVaultFile = vi.fn()
const createVaultDir = vi.fn()
const renameVaultEntry = vi.fn()
const deleteVaultEntry = vi.fn()

beforeEach(() => {
  window.localStorage.clear()
  getVaultTree.mockResolvedValue(tree)
  createVaultFile.mockResolvedValue({ ok: true })
  createVaultDir.mockResolvedValue({ ok: true })
  renameVaultEntry.mockResolvedValue({ ok: true })
  deleteVaultEntry.mockResolvedValue({ ok: true })
  window.aecpilot = {
    getVaultTree,
    showVaultEntryInExplorer,
    createVaultFile,
    createVaultDir,
    renameVaultEntry,
    deleteVaultEntry,
    onProjectOpened: () => () => {}
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// A fresh client per test: a shared cache would carry one test's tree into the
// next, and retries would swallow the failures these tests are about.
const renderExplorer = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AecI18nProvider>
        <VaultExplorer />
      </AecI18nProvider>
    </QueryClientProvider>
  )

async function clickRowAction(rowName: string, actionLabel: string) {
  const row = screen.getByTitle(rowName).closest('div') as HTMLElement
  const button = [...row.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === actionLabel
  )
  await act(async () => {
    button?.click()
  })
}

describe('VaultExplorer', () => {
  it('lists the vault root and keeps folders closed', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())
    expect(screen.getByText('AGENTS.md')).toBeTruthy()
    // A vault's top level is its map; expanding everything on load buries it.
    expect(screen.queryByText('заметка.md')).toBeNull()
  })

  it('expands and collapses a folder', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await act(async () => {
      screen.getByTitle('docs').click()
    })
    expect(screen.getByText('заметка.md')).toBeTruthy()

    await act(async () => {
      screen.getByTitle('docs').click()
    })
    expect(screen.queryByText('заметка.md')).toBeNull()
  })

  it('creates a file inside the folder it was asked from', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('новый.md')
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await clickRowAction('docs', 'Новый файл')

    expect(createVaultFile).toHaveBeenCalledWith('docs', 'новый.md')
    // The tree is re-read rather than patched locally: main owns what the vault
    // contains, including what it refused to create.
    await waitFor(() => expect(getVaultTree).toHaveBeenCalledTimes(2))
  })

  it('does nothing when the name prompt is dismissed', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await clickRowAction('docs', 'Новая папка')

    expect(createVaultDir).not.toHaveBeenCalled()
  })

  it('asks before deleting, and skips when refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Удалить')

    expect(deleteVaultEntry).not.toHaveBeenCalled()
  })

  it('deletes by path once confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Удалить')

    expect(deleteVaultEntry).toHaveBeenCalledWith('AGENTS.md')
  })

  it('shows what main refused instead of failing silently', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteVaultEntry.mockResolvedValue({ ok: false, error: 'файл занят другим процессом' })
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Удалить')

    await waitFor(() => expect(screen.getByText('файл занят другим процессом')).toBeTruthy())
  })

  it('filters by name, keeping the folder a match sits in', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    // fireEvent.change, not a raw input event: React tracks the value setter,
    // so assigning `.value` by hand leaves its state untouched.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Фильтр по имени'), { target: { value: 'замет' } })
    })

    // The match is inside `docs`, so `docs` stays — and opens itself, or the
    // match would sit behind a closed folder.
    expect(screen.getByText('docs')).toBeTruthy()
    expect(screen.getByText('замет')).toBeTruthy()
    // A sibling that matches nothing is gone.
    expect(screen.queryByText('AGENTS.md')).toBeNull()
  })

  it('says so when nothing matches', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Фильтр по имени'), {
        target: { value: 'такого-нет' }
      })
    })

    expect(screen.getByText('Ничего не найдено')).toBeTruthy()
  })

  it('reveals an entry in the OS file manager by its rel path', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Показать в проводнике')

    expect(showVaultEntryInExplorer).toHaveBeenCalledWith('AGENTS.md')
  })

  it('deletes the focused row on Del, still asking first', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    const row = screen.getByTitle('AGENTS.md').closest('div') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(row, { key: 'Delete' })
    })
    // Del is a shortcut, not a bypass: refusing the confirm keeps the file.
    expect(deleteVaultEntry).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    await act(async () => {
      fireEvent.keyDown(row, { key: 'Delete' })
    })
    expect(deleteVaultEntry).toHaveBeenCalledWith('AGENTS.md')
  })

  it('offers the same actions from the context menu', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    const row = screen.getByTitle('docs').closest('div') as HTMLElement
    await act(async () => {
      fireEvent.contextMenu(row)
    })

    // A folder offers creation; a file would not.
    expect(screen.getByRole('menuitem', { name: 'Новый файл' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Показать в проводнике' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Удалить' })).toBeTruthy()
  })

  it('renames through main, and not when the name is unchanged', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('AGENTS.md')
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Переименовать')
    expect(renameVaultEntry).not.toHaveBeenCalled()

    prompt.mockReturnValue('ПРАВИЛА.md')
    await clickRowAction('AGENTS.md', 'Переименовать')
    expect(renameVaultEntry).toHaveBeenCalledWith('AGENTS.md', 'ПРАВИЛА.md')
  })
})
