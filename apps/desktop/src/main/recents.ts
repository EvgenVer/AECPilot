// "Recent projects" persistence for task 1.3: a small MRU list written to
// `userData/recent-projects.json`. Main-process only (electron `app`) — see
// recents-pure.ts for the file-format/merge logic, tested independently.

import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addRecent, parseRecentsJson, type RecentProject } from './recents-pure'

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
