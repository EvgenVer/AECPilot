// Backup of the agent to a file (SPEC UR57, task T90). The donor's Backup section is kept for
// the backup only: the window starts `hermes backup` by REST and hands the archive path to our
// `saveBackupOut` bridge, which copies it where the person picks. The archive is never read
// back through the gateway (the download route is denied in the main process).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { en } from '../donor/i18n/en'
import { ru } from './i18n/ru'

const runBackup = vi.fn()
const notifyError = vi.fn()

vi.mock('../donor/lib/agent-transfer', () => ({
  runBackup: (...args: unknown[]) => runBackup(...args)
}))
vi.mock('../donor/store/notifications', () => ({
  notifyError: (...args: unknown[]) => notifyError(...args)
}))

const { BackupSettings } = await import('../donor/app/settings/backup-settings')

const ARCHIVE = 'C:\\home\\backups\\hermes-backup-2026-11-23-120000-abcd1234.zip'
const saveBackupOut = vi.fn()
const copy = en.settings.backup

beforeEach(() => {
  runBackup.mockReset().mockResolvedValue(ARCHIVE)
  saveBackupOut.mockReset()
  notifyError.mockReset()
  window.aecpilot = { saveBackupOut } as never
})

afterEach(cleanup)

describe('backup to a file (UR57)', () => {
  it('shows only the backup card — no transfer to Hermes Cloud (HX3)', () => {
    render(<BackupSettings />)
    expect(screen.getByText(copy.backupTitle)).toBeTruthy()
    expect(screen.queryByText(copy.transferTitle)).toBeNull()
    expect(screen.queryByText(copy.intro)).toBeNull()
  })

  it('hands the archive the core wrote to the save bridge, and says it is saved', async () => {
    saveBackupOut.mockResolvedValue({ saved: true, path: 'D:\\backup.zip' })
    render(<BackupSettings />)
    fireEvent.click(screen.getByRole('button', { name: copy.backup }))

    await waitFor(() => expect(screen.getByText(copy.backupSaved)).toBeTruthy())
    // The window hands over only the path the core named; the bytes stay with main.
    expect(saveBackupOut).toHaveBeenCalledWith(ARCHIVE)
  })

  it('a closed Save As dialog shows nothing — no path of a kept archive', async () => {
    saveBackupOut.mockResolvedValue({ saved: false, canceled: true })
    render(<BackupSettings />)
    fireEvent.click(screen.getByRole('button', { name: copy.backup }))

    await waitFor(() => expect(saveBackupOut).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: copy.backup })).toBeTruthy())
    expect(screen.queryByText(copy.backupKept(ARCHIVE))).toBeNull()
    expect(notifyError).not.toHaveBeenCalled()
  })

  it('a refusal from the bridge is reported as a failed backup', async () => {
    saveBackupOut.mockResolvedValue({ saved: false, error: 'not a backup file' })
    render(<BackupSettings />)
    fireEvent.click(screen.getByRole('button', { name: copy.backup }))

    await waitFor(() => expect(notifyError).toHaveBeenCalled())
    expect(notifyError.mock.calls[0][1]).toBe(copy.backupFailed)
  })

  it('the Russian copy is translated and warns that keys are inside in plain text', () => {
    const r = ru.settings.backup
    for (const key of [
      'backupTitle',
      'backupHelp',
      'backup',
      'backupRunning',
      'backupSaved',
      'backupFailed'
    ] as const) {
      expect(r[key], key).not.toBe(copy[key])
    }
    expect(r.backupHelp).toMatch(/открытым текстом/)
    expect(ru.settings.nav.backupOnly).not.toBe(en.settings.nav.backupOnly)
  })
})
