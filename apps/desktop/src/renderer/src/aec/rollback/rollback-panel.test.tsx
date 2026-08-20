// The panel is mostly a view over rollback-pure (tested separately, 20 cases).
// What is tested here is the part that can lose a user's work: nothing is
// overwritten without a confirmation that NAMES what will be overwritten, and
// the empty list explains itself instead of looking broken.
//
// Task 3.3 added one more: a snapshot is named by its TIME everywhere. The
// hash is an id we pass back to the gateway, and a hash on screen is a git
// concept this product does not use (SPEC HX6).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { RollbackPanel } from './RollbackPanel'
import { AecI18nProvider } from '../../shared/i18n'

const listCheckpoints = vi.fn()
const diffCheckpoint = vi.fn()
const restoreCheckpoint = vi.fn()

const listing = {
  enabled: true,
  checkpoints: [
    { hash: 'abc123deef456', timestamp: '2026-08-06T10:00:00Z' },
    { hash: 'fed654cba321', timestamp: '2026-08-06T09:00:00Z' }
  ],
  scope: { kind: 'vault' }
}

beforeEach(() => {
  window.localStorage.clear()
  listCheckpoints.mockResolvedValue(listing)
  diffCheckpoint.mockResolvedValue({
    stat: ' docs/а.md | 2 +-',
    diff: 'diff --git a/docs/а.md b/docs/а.md\n--- a/docs/а.md\n+++ b/docs/а.md\n@@ -1 +1 @@\n-старое\n+новое\n'
  })
  restoreCheckpoint.mockResolvedValue({ success: true })
  window.aecpilot = {
    listCheckpoints,
    diffCheckpoint,
    restoreCheckpoint
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
        <RollbackPanel />
      </AecI18nProvider>
    </QueryClientProvider>
  )

const click = async (name: string | RegExp) => {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
}

describe('RollbackPanel', () => {
  it('explains an empty list instead of showing a blank panel', async () => {
    listCheckpoints.mockResolvedValue({ enabled: true, checkpoints: [], scope: { kind: 'vault' } })
    renderPanel()
    await waitFor(() =>
      expect(screen.getByText('Снимков пока нет — агент ещё ничего не правил.')).toBeTruthy()
    )
  })

  it('says so when checkpoints are switched off entirely', async () => {
    listCheckpoints.mockResolvedValue({ enabled: false, checkpoints: [], scope: { kind: 'vault' } })
    renderPanel()
    await waitFor(() =>
      expect(
        screen.getByText('Чекпойнты выключены — снимки правок агента не сохраняются.')
      ).toBeTruthy()
    )
  })

  it('names snapshots by time and never shows a hash (SPEC HX6)', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('06.08.2026, 10:00')).toBeTruthy())
    expect(screen.getByText('06.08.2026, 09:00')).toBeTruthy()

    // Both fixtures' hashes, in full and abbreviated form.
    for (const hash of ['abc123deef456', 'abc123de', 'fed654cba321', 'fed654cb']) {
      expect(screen.queryByText(new RegExp(hash))).toBeNull()
    }

    await click(/06\.08\.2026, 10:00/)
    await waitFor(() => expect(screen.getByText('docs/а.md')).toBeTruthy())

    // The diff header and the confirmation speak the same language.
    expect(screen.getByText('Что изменилось после 06.08.2026, 10:00')).toBeTruthy()
    await click('Восстановить всё')
    expect(screen.getByText(/состоянием на 06\.08\.2026, 10:00/)).toBeTruthy()
  })

  it('shows the diff of the snapshot the user picked', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('06.08.2026, 10:00')).toBeTruthy())

    await click(/06\.08\.2026, 10:00/)

    await waitFor(() => expect(diffCheckpoint).toHaveBeenCalledWith('abc123deef456'))
    expect(screen.getByText('docs/а.md')).toBeTruthy()
  })

  it('names what a whole-snapshot restore will overwrite, and only then restores', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('06.08.2026, 10:00')).toBeTruthy())
    await click(/06\.08\.2026, 10:00/)
    await waitFor(() => expect(screen.getByText('docs/а.md')).toBeTruthy())

    await click('Восстановить всё')

    // The confirmation is specific: every file, this snapshot, and the turn
    // disappearing from history.
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText(/Все файлы будут перезаписаны/)).toBeTruthy()
    expect(restoreCheckpoint).not.toHaveBeenCalled()

    await click('Восстановить')

    expect(restoreCheckpoint).toHaveBeenCalledWith({ hash: 'abc123deef456', confirmed: true })
  })

  it('names the single file when only that file is being restored', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('06.08.2026, 10:00')).toBeTruthy())
    await click(/06\.08\.2026, 10:00/)
    await waitFor(() => expect(screen.getByText('docs/а.md')).toBeTruthy())

    await click('Восстановить файл')
    expect(screen.getByText(/Файл docs\/а\.md будет перезаписан/)).toBeTruthy()

    await click('Восстановить')
    expect(restoreCheckpoint).toHaveBeenCalledWith({
      hash: 'abc123deef456',
      filePath: 'docs/а.md',
      confirmed: true
    })
  })

  it('reports a refusal that arrived as a successful call', async () => {
    // Their handler passes the manager's verdict through, so a refusal is
    // `{ success: false }` on a call that did not throw.
    restoreCheckpoint.mockResolvedValue({ success: false, error: 'рабочая копия занята' })
    renderPanel()
    await waitFor(() => expect(screen.getByText('06.08.2026, 10:00')).toBeTruthy())
    await click(/06\.08\.2026, 10:00/)
    await waitFor(() => expect(screen.getByText('docs/а.md')).toBeTruthy())
    await click('Восстановить всё')
    await click('Восстановить')

    await waitFor(() =>
      expect(screen.getByText('Не удалось восстановить: рабочая копия занята')).toBeTruthy()
    )
  })

  it('backs out without touching anything', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('06.08.2026, 10:00')).toBeTruthy())
    await click(/06\.08\.2026, 10:00/)
    await waitFor(() => expect(screen.getByText('docs/а.md')).toBeTruthy())
    await click('Восстановить всё')

    await click('Отмена')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(restoreCheckpoint).not.toHaveBeenCalled()
  })
})
