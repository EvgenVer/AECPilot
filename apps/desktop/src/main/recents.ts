// "Recent projects" persistence for task 1.3: a small MRU list written to
// `userData/recent-projects.json`. Main-process only (electron `app`) — see
// recents-pure.ts for the file-format/merge logic, tested independently.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addRecent, parseRecentsJson, type RecentProject } from './recents-pure'
import { installRoot } from './aec-rag-command'
import { installedDataDir } from './data-root-pure'
import {
  addIndexLocation,
  parseIndexLocations,
  serializeIndexLocations
} from './index-locations-pure'

export type { RecentProject }

function recentsPath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

/** Reads the recents list, tolerating "file doesn't exist yet" (first run)
 * the same way `parseRecentsJson` tolerates a malformed file. */
export function loadRecents(): RecentProject[] {
  try {
    return parseRecentsJson(readFileSync(recentsPath(), 'utf-8'))
  } catch {
    return []
  }
}

/** Adds `entry` to the recents list (MRU, de-duplicated, capped — see
 * `addRecent`) and persists it via a temp-file + rename, so a crash mid-write
 * can never leave a half-written/corrupt recents file. If the rename itself
 * fails, the leftover tmp file is removed (best-effort) before the original
 * error is re-thrown — the caller (`project:create` in main/index.ts)
 * already treats a `recordRecent` failure as best-effort. Returns the
 * updated list. */
export function recordRecent(entry: RecentProject): RecentProject[] {
  recordIndexLocation(entry.vaultPath)
  const next = addRecent(loadRecents(), entry)
  const target = recentsPath()
  mkdirSync(dirname(target), { recursive: true })
  const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf-8')
  try {
    renameSync(tmpPath, target)
  } catch (error: unknown) {
    rmSync(tmpPath, { force: true })
    throw error
  }
  return next
}

/** Task T30: every project this installation opened, for the uninstaller's «remove
 *  project indexes» option — `<root>/data/index-locations.txt` when installed (the
 *  uninstaller reads exactly that path), `userData` otherwise. Best-effort: a failed
 *  write must not block opening a project. */
function indexLocationsPath(): string {
  const dataDir = installedDataDir({ root: installRoot(), exists: existsSync })
  return join(dataDir ?? app.getPath('userData'), 'index-locations.txt')
}

function recordIndexLocation(vaultPath: string): void {
  try {
    const file = indexLocationsPath()
    const list = existsSync(file) ? parseIndexLocations(readFileSync(file)) : []
    const next = addIndexLocation(list, vaultPath)
    if (next === list) return
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, serializeIndexLocations(next))
  } catch {
    // the list only serves the uninstaller's option; the project opens regardless
  }
}
