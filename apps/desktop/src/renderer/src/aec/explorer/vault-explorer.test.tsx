// What matters about the explorer is not that it draws a tree — it is that
// every action goes through main with the right arguments, and that a failed
// one says so instead of silently doing nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { VaultExplorer } from './VaultExplorer'
import { $graphTarget } from './graph-add-store'
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
const getConnection = vi.fn()
const showVaultEntryInExplorer = vi.fn()
const createVaultFile = vi.fn()
const createVaultDir = vi.fn()
const renameVaultEntry = vi.fn()
const deleteVaultEntry = vi.fn()
const listProjectIndex = vi.fn()
const includeInIndex = vi.fn()
const excludeFromIndex = vi.fn()
const openIndexPage = vi.fn()

vi.mock('../workspace-pages', () => ({ openIndexPage: () => openIndexPage() }))

beforeEach(() => {
  window.localStorage.clear()
  getVaultTree.mockResolvedValue(tree)
  getConnection.mockResolvedValue({ mode: 'local' })
  createVaultFile.mockResolvedValue({ ok: true })
  createVaultDir.mockResolvedValue({ ok: true })
  renameVaultEntry.mockResolvedValue({ ok: true })
  deleteVaultEntry.mockResolvedValue({ ok: true })
  listProjectIndex.mockResolvedValue([])
  includeInIndex.mockResolvedValue({ files: ['AGENTS.md'], ok: true, started: true })
  excludeFromIndex.mockResolvedValue({ files: [], ok: true })
  window.aecpilot = {
    getVaultTree,
    getConnection,
    showVaultEntryInExplorer,
    createVaultFile,
    createVaultDir,
    renameVaultEntry,
    deleteVaultEntry,
    listProjectIndex,
    includeInIndex,
    excludeFromIndex,
    onProjectOpened: () => () => {},
    // Панель источников висит в том же дереве и с задачи 5.15 слушает состояние
    // графового прогона. Сам граф к этим тестам не относится — заглушки ровно
    // настолько, чтобы окно не падало на подписке.
    getGraphAddState: () =>
      Promise.resolve({
        error: null,
        lastReport: null,
        path: null,
        progress: null,
        running: false
      }),
    onGraphAddState: () => () => {}
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

/** D-204: «вы уверены?» — окно приложения. Системный `window.confirm` оставляет
 *  окно Electron без фокуса клавиатуры, поэтому здесь он бросает: позвать его —
 *  значит вернуть дефект. */
function forbidNativeConfirm() {
  return vi.spyOn(window, 'confirm').mockImplementation(() => {
    throw new Error('window.confirm вызван (D-204)')
  })
}

/** Ответить окну подтверждения кнопкой с этой подписью. */
async function answerConfirm(button: string) {
  const dialog = await screen.findByRole('dialog')
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: button }))
  })
}

/** Ответить окну «как назвать?» (`NamePrompt`): имя — ввести и подтвердить,
 *  `null` — отказаться. Своё окно вместо `window.prompt`, которого в Electron
 *  нет (дефект D-90). */
async function answerName(name: string | null) {
  const dialog = await screen.findByRole('dialog')
  await act(async () => {
    if (name === null) {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
      return
    }
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: name } })
    fireEvent.submit(dialog)
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
    // Дефект D-90: в Electron `window.prompt` не реализован и бросает — jsdom
    // его подменял, и падение видел только человек. Здесь он ведёт себя как
    // Electron, и проводник обязан спросить имя своим окном.
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('prompt() is not supported.')
    })
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await clickRowAction('docs', 'Новый файл')
    await answerName('новый.md')

    expect(prompt).not.toHaveBeenCalled()
    expect(createVaultFile).toHaveBeenCalledWith('docs', 'новый.md')
    // The tree is re-read rather than patched locally: main owns what the vault
    // contains, including what it refused to create.
    await waitFor(() => expect(getVaultTree).toHaveBeenCalledTimes(2))
  })

  it('does nothing when the name prompt is dismissed', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await clickRowAction('docs', 'Новая папка')
    await answerName(null)

    expect(createVaultDir).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(createVaultDir).not.toHaveBeenCalled()
  })

  it('asks before deleting, and skips when refused', async () => {
    const native = forbidNativeConfirm()
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Удалить')
    await answerConfirm('Отмена')

    expect(deleteVaultEntry).not.toHaveBeenCalled()
    expect(native).not.toHaveBeenCalled()
  })

  it('deletes by path once confirmed', async () => {
    forbidNativeConfirm()
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Удалить')
    await answerConfirm('Удалить')

    await waitFor(() => expect(deleteVaultEntry).toHaveBeenCalledWith('AGENTS.md'))
  })

  it('shows what main refused instead of failing silently', async () => {
    forbidNativeConfirm()
    deleteVaultEntry.mockResolvedValue({ ok: false, error: 'файл занят другим процессом' })
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Удалить')
    await answerConfirm('Удалить')

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
    forbidNativeConfirm()
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    const row = screen.getByTitle('AGENTS.md').closest('div') as HTMLElement
    await act(async () => {
      fireEvent.keyDown(row, { key: 'Delete' })
    })
    // Del is a shortcut, not a bypass: refusing the confirm keeps the file.
    await answerConfirm('Отмена')
    expect(deleteVaultEntry).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.keyDown(row, { key: 'Delete' })
    })
    await answerConfirm('Удалить')
    await waitFor(() => expect(deleteVaultEntry).toHaveBeenCalledWith('AGENTS.md'))
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
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await clickRowAction('AGENTS.md', 'Переименовать')
    // Окно подставляет текущее имя — подтверждение без правки ничего не делает.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox').getAttribute('value')).toBe('AGENTS.md')
    await answerName('AGENTS.md')
    expect(renameVaultEntry).not.toHaveBeenCalled()

    await clickRowAction('AGENTS.md', 'Переименовать')
    await answerName('ПРАВИЛА.md')
    expect(renameVaultEntry).toHaveBeenCalledWith('AGENTS.md', 'ПРАВИЛА.md')
  })
})

// Задача 3.13b. Хранилище проекта — понятие ЭТОЙ машины. При ядре на другой
// машине дерево показывало бы местные файлы, выглядя исправным, — а агент в это
// время правит совсем другие.
describe('ядро на другой машине', () => {
  it('дерево не показывается вовсе, и сказано почему', async () => {
    getConnection.mockResolvedValue({ mode: 'remote' })

    renderExplorer()

    expect(await screen.findByText(/Файлы — на машине ядра/)).toBeTruthy()
    expect(screen.getByText(/дерево проекта/)).toBeTruthy()
  })

  it('за местным деревом даже не ходим — его нечем показать правильно', async () => {
    getConnection.mockResolvedValue({ mode: 'ssh' })

    renderExplorer()

    await screen.findByText(/Файлы — на машине ядра/)
    expect(getVaultTree).not.toHaveBeenCalled()
  })

  it('локальное ядро — дерево на месте', async () => {
    renderExplorer()

    expect(await screen.findByText('AGENTS.md')).toBeTruthy()
  })
})

// Задача 3K.5 (SPEC UR45): файлы проекта попадают в индекс только по выбору
// человека — пункт меню на строке, и никак иначе.
describe('файлы проекта в индексе', () => {
  async function openMenu(rowName: string) {
    const row = screen.getByTitle(rowName).closest('div') as HTMLElement
    await act(async () => {
      fireEvent.contextMenu(row)
    })
  }

  it('неотмеченный файл: только «Включить в индекс»; включение открывает «Индекс»', async () => {
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await openMenu('AGENTS.md')
    expect(screen.queryByRole('menuitem', { name: 'Убрать из индекса' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Добавить в граф знаний' })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Включить в индекс' }))
    })

    expect(includeInIndex).toHaveBeenCalledWith({ kind: 'file', rel: 'AGENTS.md' })
    expect(openIndexPage).toHaveBeenCalled()
    // Ответ main — новый список отметок: значок появляется сразу.
    await waitFor(() => expect(screen.getByRole('img', { name: 'В индексе' })).toBeTruthy())
  })

  it('отмеченный файл: значок, «Убрать из индекса» с вопросом и граф на project', async () => {
    listProjectIndex.mockResolvedValue(['docs/заметка.md'])
    const native = forbidNativeConfirm()
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())
    await act(async () => {
      fireEvent.click(screen.getByTitle('docs'))
    })
    await waitFor(() => expect(screen.getByRole('img', { name: 'В индексе' })).toBeTruthy())

    await openMenu('docs/заметка.md')
    expect(screen.queryByRole('menuitem', { name: 'Включить в индекс' })).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Добавить в граф знаний' }))
    })
    expect($graphTarget.get()).toEqual({
      kind: 'file',
      label: 'docs/заметка.md',
      rel: 'docs/заметка.md',
      sourceId: 'project'
    })
    $graphTarget.set(null)

    await openMenu('docs/заметка.md')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Убрать из индекса' }))
    })
    await answerConfirm('Убрать из индекса')
    expect(native).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(excludeFromIndex).toHaveBeenCalledWith({ kind: 'file', rel: 'docs/заметка.md' })
    )
    await waitFor(() => expect(screen.queryByRole('img', { name: 'В индексе' })).toBeNull())
  })

  it('папка с частью отмеченного предлагает и включить, и убрать', async () => {
    listProjectIndex.mockResolvedValue(['docs/старое.md'])
    renderExplorer()
    await waitFor(() => expect(screen.getByText('docs')).toBeTruthy())

    await openMenu('docs')
    expect(screen.getByRole('menuitem', { name: 'Включить в индекс' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Убрать из индекса' })).toBeTruthy()
  })

  it('отказ main показан, а «Индекс» не открывается', async () => {
    includeInIndex.mockResolvedValue({ error: 'Индексация уже идёт', ok: false })
    renderExplorer()
    await waitFor(() => expect(screen.getByText('AGENTS.md')).toBeTruthy())

    await openMenu('AGENTS.md')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Включить в индекс' }))
    })

    expect(await screen.findByText('Индексация уже идёт')).toBeTruthy()
    expect(openIndexPage).not.toHaveBeenCalled()
  })
})
