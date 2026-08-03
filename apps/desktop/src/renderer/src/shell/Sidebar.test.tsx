import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Sidebar from './Sidebar'
import type { AecpilotApi, OpenProject } from '../../../shared/ipc'

/**
 * Component-level regression for the block-D defect (fix 38c9187, reported by
 * the manual run of 2026-07-26 as "команды ПКМ у источника молча не
 * работают"). The bug is pure component state and could not be covered when it
 * was fixed — the project had no DOM test environment; task 1.6.3 added one,
 * and this is the test that was owed.
 *
 * What it pins down: `selectSourceEntry` sets `selectedSource` and then calls
 * react-arborist's `deselectAll()` to drop the vault-tree highlight — and that
 * call fires `onSelect([])` unconditionally (`setSelection` ends in
 * `safeRun(this.props.onSelect, ...)`, tree-api.js). The tree is the REAL
 * react-arborist here, on purpose: mocking it away would test our assumption
 * about the library instead of the library.
 */

const showSourceEntryInExplorer = vi.fn()
const showVaultEntryInExplorer = vi.fn()

const PROJECT: OpenProject = { name: 'Проект', vaultPath: 'D:\\proj\\vault' }
const SOURCE_ROOT = 'D:\\proj\\ИД'

/** Reports one fixed size to every observer: jsdom measures nothing, and
 * react-arborist renders no rows at height 0. */
class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void {
    this.callback(
      [{ contentRect: { width: 280, height: 320 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    )
  }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  const api = {
    getVaultTree: async () => [{ name: 'notes.md', path: 'notes.md', type: 'file' as const }],
    listSources: async () => [
      { id: 's1', root_path: SOURCE_ROOT, added_at: '2026-07-28T00:00:00.000Z' }
    ],
    getSourceStatus: async () => ({ ok: true as const, status: 'ok' as const }),
    onScanReport: () => () => {},
    showSourceEntryInExplorer,
    showVaultEntryInExplorer
  }
  window.aecpilot = api as unknown as AecpilotApi
  showSourceEntryInExplorer.mockResolvedValue({ ok: true })
  showVaultEntryInExplorer.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function renderSidebar(): void {
  render(
    <Sidebar
      active="explorer"
      currentProject={PROJECT}
      sourcesHeight={150}
      onResizeSources={() => {}}
      onCommitSizes={() => {}}
      chatStreaming={false}
      onSessionLoaded={() => {}}
    />
  )
}

test('a context-menu command on a source acts on that source (block D)', async () => {
  renderSidebar()
  // Waits for both loads (vault tree + sources) — the row only exists after
  // `listSources` resolves, and the vault tree must be non-empty by then, or
  // `<Tree>` is not mounted at all and `deselectAll()` could not misfire.
  const sourceRow = await screen.findByTitle(SOURCE_ROOT)
  expect(screen.getByText('notes.md')).toBeDefined()

  // Right-click selects the source and opens the menu (`handleSourceContext
  // Menu`), which is where `deselectAll()` fires its empty `onSelect`.
  fireEvent.contextMenu(sourceRow)
  fireEvent.click(await screen.findByText('Показать в проводнике'))

  await waitFor(() => expect(showSourceEntryInExplorer).toHaveBeenCalledWith('s1', ''))
  expect(showVaultEntryInExplorer).not.toHaveBeenCalled()
})

test('picking a vault node still clears the source selection', async () => {
  // The other half of the invariant: the fix guards the EMPTY selection only.
  // A real vault selection must still win, or the two panes could both claim
  // to be selected and the same command would hit the wrong one.
  renderSidebar()
  const sourceRow = await screen.findByTitle(SOURCE_ROOT)
  fireEvent.contextMenu(sourceRow)
  fireEvent.keyDown(document, { key: 'Escape' })

  fireEvent.click(screen.getByText('notes.md'))
  fireEvent.contextMenu(screen.getByText('notes.md'))
  fireEvent.click(await screen.findByText('Показать в проводнике'))

  await waitFor(() => expect(showVaultEntryInExplorer).toHaveBeenCalledWith('notes.md'))
  expect(showSourceEntryInExplorer).not.toHaveBeenCalled()
})
