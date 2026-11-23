// Which archive the main process copies out (task T90). Runs on a temporary folder made for
// the test; nothing outside it is touched.

import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkBackupArchive } from './backup-archive-pure'

const NAME = 'hermes-backup-2026-11-23-120000-abcd1234.zip'
let home = ''
let outside = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aec-t90-home-'))
  outside = mkdtempSync(join(tmpdir(), 'aec-t90-outside-'))
  mkdirSync(join(home, 'backups'))
  mkdirSync(join(home, 'profiles', 'engineer', 'backups'), { recursive: true })
  writeFileSync(join(home, 'backups', NAME), 'zip')
  writeFileSync(join(home, 'profiles', 'engineer', 'backups', NAME), 'zip')
  writeFileSync(join(outside, NAME), 'zip')
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('checkBackupArchive', () => {
  it('accepts an archive in the home backups folder and in a profile backups folder', async () => {
    expect((await checkBackupArchive(home, join(home, 'backups', NAME))).ok).toBe(true)
    expect(
      (await checkBackupArchive(home, join(home, 'profiles', 'engineer', 'backups', NAME))).ok
    ).toBe(true)
  })

  it('refuses a file of the same name outside the core home', async () => {
    expect(await checkBackupArchive(home, join(outside, NAME))).toMatchObject({ ok: false })
  })

  it('refuses another file inside the home: `.env`, config, a zip under another name', async () => {
    writeFileSync(join(home, '.env'), 'KEY=1')
    writeFileSync(join(home, 'backups', 'other.zip'), 'zip')
    expect((await checkBackupArchive(home, join(home, '.env'))).ok).toBe(false)
    expect((await checkBackupArchive(home, join(home, 'backups', 'other.zip'))).ok).toBe(false)
  })

  it('refuses a traversal out of the backups folder and a nested folder', async () => {
    mkdirSync(join(home, 'backups', 'deep'))
    writeFileSync(join(home, 'backups', 'deep', NAME), 'zip')
    // A relative `..` walk that ends at a real file outside the home.
    const walk = join(home, 'backups', relative(join(home, 'backups'), join(outside, NAME)))
    expect(existsSync(walk)).toBe(true)
    expect(await checkBackupArchive(home, walk)).toMatchObject({
      reason: 'outside the backups folder'
    })
    expect((await checkBackupArchive(home, join(home, 'backups', 'deep', NAME))).ok).toBe(false)
  })

  it('refuses a `backups` folder that is a junction pointing outside the home', async () => {
    const profile = join(home, 'profiles', 'linked')
    mkdirSync(profile, { recursive: true })
    symlinkSync(outside, join(profile, 'backups'), 'junction')
    const viaJunction = join(profile, 'backups', NAME)
    expect(existsSync(viaJunction)).toBe(true)
    expect(await checkBackupArchive(home, viaJunction)).toMatchObject({ ok: false })
  })

  it('refuses a network path before touching the disk', async () => {
    expect(await checkBackupArchive(home, `\\\\attacker\\share\\backups\\${NAME}`)).toMatchObject({
      reason: 'network or device path'
    })
    expect(await checkBackupArchive(home, `//attacker/share/backups/${NAME}`)).toMatchObject({
      reason: 'network or device path'
    })
  })

  it.runIf(process.platform === 'win32')(
    'accepts the archive written in another case',
    async () => {
      expect((await checkBackupArchive(home, join(home, 'BACKUPS', NAME))).ok).toBe(true)
    }
  )

  it('refuses a file link inside backups that points outside', async (context) => {
    const link = join(home, 'backups', 'hermes-backup-link.zip')
    try {
      symlinkSync(join(outside, NAME), link, 'file')
    } catch {
      context.skip() // file symlinks need Developer Mode on Windows; the junction case covers links
    }
    expect((await checkBackupArchive(home, link)).ok).toBe(false)
  })

  it('refuses what is not a path, a missing file and a folder', async () => {
    expect((await checkBackupArchive(home, 42)).ok).toBe(false)
    expect((await checkBackupArchive(home, '')).ok).toBe(false)
    expect(
      (await checkBackupArchive(home, join(home, 'backups', 'hermes-backup-gone.zip'))).ok
    ).toBe(false)
    mkdirSync(join(home, 'backups', 'hermes-backup-dir.zip'))
    expect(
      (await checkBackupArchive(home, join(home, 'backups', 'hermes-backup-dir.zip'))).ok
    ).toBe(false)
  })
})
