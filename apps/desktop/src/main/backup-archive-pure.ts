// Which backup archive the main process may copy out (task T90, UR57).
//
// The window starts `hermes backup` through the core's REST route, which writes a zip into
// `<profile home>/backups` and answers with its path. The archive holds the profile's `.env`
// and sign-ins as plain text, so the window never reads it (the download and chunk routes are
// denied in `gateway-passthrough-pure.ts`); it hands the path back and the main process copies
// the file to the place the person picks. That path comes from the window, so it is checked
// here like any other untrusted path: only a file the core's backup route could have written —
// named `hermes-backup-….zip`, lying directly in the `backups` folder of the core's home or of
// one of its profiles, after symlinks are resolved.

import * as fs from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

/** The name the core's backup route gives an archive (`hermes_cli/web_routers/ops.py`). */
const ARCHIVE_NAME = /^hermes-backup-[A-Za-z0-9-]+\.zip$/

/** One path segment a profile folder can have; no separators, no `..`. */
const PROFILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

export type ArchiveCheck = { ok: true; path: string } | { ok: false; reason: string }

async function realOrNull(path: string): Promise<string | null> {
  try {
    return await fs.realpath(path)
  } catch {
    return null
  }
}

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** The `backups` folders an archive may live in: the home's own and each profile's. */
function allowedFolder(home: string, folder: string): boolean {
  const root = resolve(home)
  if (samePath(folder, join(root, 'backups'))) return true

  const profileDir = dirname(folder)
  return (
    samePath(basename(folder), 'backups') &&
    samePath(dirname(profileDir), join(root, 'profiles')) &&
    PROFILE_NAME.test(basename(profileDir))
  )
}

/** Resolves `archive` to a real file the core's backup route wrote under `home`, or says why not. */
export async function checkBackupArchive(home: string, archive: unknown): Promise<ArchiveCheck> {
  if (typeof archive !== 'string' || archive.length === 0 || archive.length > 1024) {
    return { ok: false, reason: 'not a path' }
  }
  if (!ARCHIVE_NAME.test(basename(archive))) return { ok: false, reason: 'not a backup archive' }
  // Before any disk access: resolving a UNC or device path would open an SMB session to a host
  // the caller named, which hands it the Windows credentials (NTLM).
  if (/^[\\/]{2}/.test(archive) || /^[\\/]{2}/.test(home)) {
    return { ok: false, reason: 'network or device path' }
  }
  if (
    !allowedFolder(home, dirname(resolve(archive))) &&
    !allowedFolder(resolve(home), dirname(resolve(archive)))
  ) {
    return { ok: false, reason: 'outside the backups folder' }
  }

  const realHome = await realOrNull(home)
  const realArchive = await realOrNull(archive)
  if (!realHome || !realArchive) return { ok: false, reason: 'not found' }

  // The real path must sit in an allowed folder too: a link or junction inside the home that
  // points elsewhere fails here.
  if (!allowedFolder(realHome, dirname(realArchive))) {
    return { ok: false, reason: 'outside the backups folder' }
  }
  if (!ARCHIVE_NAME.test(basename(realArchive)))
    return { ok: false, reason: 'not a backup archive' }

  try {
    if (!(await fs.stat(realArchive)).isFile()) return { ok: false, reason: 'not a file' }
  } catch {
    return { ok: false, reason: 'not found' }
  }

  return { ok: true, path: realArchive }
}
