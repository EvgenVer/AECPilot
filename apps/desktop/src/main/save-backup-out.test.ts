// `saveBackupOut` (task T90, UR57): the archive leaves the core's home only through Save As
// and is removed from the home whatever the answer. Runs on temporary folders made here.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dialogAnswer = { canceled: false, filePath: '' as string | undefined }

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showSaveDialog: vi.fn(async () => ({ ...dialogAnswer })) }
}))
vi.mock('./i18n', () => ({ mainT: (key: string) => key }))

const { discardBackups, saveBackupOut } = await import('./save-out')

const NAME = 'hermes-backup-2026-11-23-120000-abcd1234.zip'
let home = ''
let out = ''
let archive = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aec-t90-save-home-'))
  out = mkdtempSync(join(tmpdir(), 'aec-t90-save-out-'))
  mkdirSync(join(home, 'backups'))
  archive = join(home, 'backups', NAME)
  writeFileSync(archive, 'archive bytes')
  dialogAnswer.canceled = false
  dialogAnswer.filePath = join(out, 'saved.zip')
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

describe('saveBackupOut', () => {
  it('copies the archive where the person chose and removes it from the home', async () => {
    const result = await saveBackupOut(undefined, home, archive)
    expect(result).toMatchObject({ saved: true, path: join(out, 'saved.zip') })
    expect(readFileSync(join(out, 'saved.zip'), 'utf8')).toBe('archive bytes')
    expect(existsSync(archive)).toBe(false)
  })

  it('a closed dialog saves nothing and still removes the archive', async () => {
    dialogAnswer.canceled = true
    dialogAnswer.filePath = undefined
    const result = await saveBackupOut(undefined, home, archive)
    expect(result).toEqual({ saved: false, canceled: true })
    expect(existsSync(archive)).toBe(false)
  })

  it('refuses before the dialog when the path is not a core backup archive', async () => {
    writeFileSync(join(home, '.env'), 'KEY=1')
    const result = await saveBackupOut(undefined, home, join(home, '.env'))
    expect(result).toMatchObject({ saved: false, error: 'saveOut.backupRefused' })
    expect(existsSync(join(home, '.env'))).toBe(true)
  })

  it('choosing the archive itself as the target does not report a save', async () => {
    dialogAnswer.filePath = archive
    const result = await saveBackupOut(undefined, home, archive)
    expect(result).toMatchObject({ saved: false, error: 'saveOut.backupRefused' })
  })

  it('a failed copy is reported and the archive is still removed', async () => {
    dialogAnswer.filePath = join(out, 'no-such-folder', 'saved.zip')
    const result = await saveBackupOut(undefined, home, archive)
    expect(result.saved).toBe(false)
    expect(result.error).toBeTruthy()
    expect(existsSync(archive)).toBe(false)
  })
})

describe('discardBackups', () => {
  it('removes the unsaved archives of this run and nothing else', () => {
    const other = join(home, 'backups', 'keep-me.zip')
    writeFileSync(other, 'x')
    const set = new Set([archive, other])
    discardBackups(set)
    expect(existsSync(archive)).toBe(false)
    expect(existsSync(other)).toBe(true)
    expect(set.size).toBe(0)
  })
})
