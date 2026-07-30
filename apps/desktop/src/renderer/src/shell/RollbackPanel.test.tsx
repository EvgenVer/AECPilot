// Task 1.6.C2 — the screen. The pure decisions are covered in
// rollback-pure.test.ts; what matters here is that a destructive restore
// cannot happen without the confirmation step, and that an empty list which is
// NOT the agent's inactivity says so.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import RollbackPanel from './RollbackPanel'

const listCheckpoints = vi.fn()
const diffCheckpoint = vi.fn()
const restoreCheckpoint = vi.fn()

const CHECKPOINT = { hash: 'abcdef1234567890', timestamp: '2026-07-30T04:21:00+03:00' }

beforeEach(() => {
  listCheckpoints.mockResolvedValue({
    enabled: true,
    checkpoints: [],
    scope: { kind: 'vault' }
  })
  diffCheckpoint.mockResolvedValue({ stat: '', diff: '' })
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

describe('RollbackPanel', () => {
  it('an empty list with a healthy scope says the agent changed nothing', async () => {
    render(<RollbackPanel />)
    expect(await screen.findByText(/агент ещё ничего не правил/)).toBeTruthy()
  })

  it('an empty list caused by the home-directory guard says nothing is recorded at all', async () => {
    listCheckpoints.mockResolvedValue({
      enabled: true,
      checkpoints: [],
      scope: { kind: 'blocked', dir: 'C:\\Users\\Ivan' }
    })
    render(<RollbackPanel />)
    // The distinction this whole screen exists for: not "no changes" but
    // "no snapshot was ever taken".
    expect(await screen.findByText(/Снимки не создаются вообще/)).toBeTruthy()
    expect(screen.queryByText(/агент ещё ничего не правил/)).toBeNull()
  })

  it('says checkpoints are off rather than showing an empty list', async () => {
    listCheckpoints.mockResolvedValue({
      enabled: false,
      checkpoints: [],
      scope: { kind: 'vault' }
    })
    render(<RollbackPanel />)
    expect(await screen.findByText(/Чекпойнты выключены/)).toBeTruthy()
  })

  it('lists snapshots and opens the diff of the one clicked', async () => {
    listCheckpoints.mockResolvedValue({
      enabled: true,
      checkpoints: [CHECKPOINT],
      scope: { kind: 'vault' }
    })
    diffCheckpoint.mockResolvedValue({
      stat: ' x.md | 2 +-',
      diff: 'diff --git a/x.md b/x.md\nindex 1..2 100644\n@@ -1 +1 @@\n-старое\n+новое'
    })
    render(<RollbackPanel />)

    const row = await screen.findByText('30.07.2026, 04:21')
    await act(async () => {
      row.click()
    })
    await waitFor(() => expect(diffCheckpoint).toHaveBeenCalledWith(CHECKPOINT.hash))
    expect(await screen.findByText('x.md')).toBeTruthy()
  })

  it('restoring asks first, and only then calls the destructive IPC', async () => {
    listCheckpoints.mockResolvedValue({
      enabled: true,
      checkpoints: [CHECKPOINT],
      scope: { kind: 'vault' }
    })
    diffCheckpoint.mockResolvedValue({
      stat: ' x.md | 2 +-',
      diff: 'diff --git a/x.md b/x.md\nindex 1..2 100644'
    })
    render(<RollbackPanel />)

    const row = await screen.findByText('30.07.2026, 04:21')
    await act(async () => {
      row.click()
    })
    const restoreFile = await screen.findByRole('button', { name: 'Восстановить файл' })
    await act(async () => {
      restoreFile.click()
    })

    // The click alone must not restore anything.
    expect(restoreCheckpoint).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()

    await act(async () => {
      screen.getByRole('button', { name: 'Восстановить' }).click()
    })
    expect(restoreCheckpoint).toHaveBeenCalledWith({
      hash: CHECKPOINT.hash,
      filePath: 'x.md',
      confirmed: true
    })
  })

  it('a refusal from hermes arrives as success:false and is shown, not swallowed', async () => {
    listCheckpoints.mockResolvedValue({
      enabled: true,
      checkpoints: [CHECKPOINT],
      scope: { kind: 'vault' }
    })
    diffCheckpoint.mockResolvedValue({ stat: 'x', diff: 'diff --git a/x.md b/x.md' })
    restoreCheckpoint.mockResolvedValue({ success: false, error: 'turn in progress' })
    render(<RollbackPanel />)

    const row = await screen.findByText('30.07.2026, 04:21')
    await act(async () => {
      row.click()
    })
    const restoreAll = await screen.findByRole('button', { name: 'Восстановить всё' })
    await act(async () => {
      restoreAll.click()
    })
    await act(async () => {
      screen.getByRole('button', { name: 'Восстановить' }).click()
    })

    expect(await screen.findByText(/turn in progress/)).toBeTruthy()
  })

  it('an ambiguous empty diff says both things it can mean', async () => {
    listCheckpoints.mockResolvedValue({
      enabled: true,
      checkpoints: [CHECKPOINT],
      scope: { kind: 'vault' }
    })
    render(<RollbackPanel />)
    const row = await screen.findByText('30.07.2026, 04:21')
    await act(async () => {
      row.click()
    })
    expect(await screen.findByText(/самого снимка уже нет/)).toBeTruthy()
  })
})
