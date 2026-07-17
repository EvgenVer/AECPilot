// "Chat session <-> project" tagging persistence for task 1.20: a small
// app-level mapping written to `userData/chat-sessions-by-project.json`
// (same storage pattern as recents.ts) — see session-projects-pure.ts's
// header comment for why the desktop keeps this itself instead of asking
// the gateway.

import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  parseSessionProjectsJson,
  sessionIdsForProject as pureSessionIdsForProject,
  tagSession,
  untaggedSessionIds as pureUntaggedSessionIds,
  type SessionProjectMap
} from './session-projects-pure'

function storePath(): string {
  return join(app.getPath('userData'), 'chat-sessions-by-project.json')
}

function loadMap(): SessionProjectMap {
  try {
    return parseSessionProjectsJson(readFileSync(storePath(), 'utf-8'))
  } catch {
    return {}
  }
}

function saveMap(map: SessionProjectMap): void {
  const target = storePath()
  mkdirSync(dirname(target), { recursive: true })
  const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmpPath, JSON.stringify(map, null, 2), 'utf-8')
  try {
    renameSync(tmpPath, target)
  } catch (error: unknown) {
    rmSync(tmpPath, { force: true })
    throw error
  }
}

/** Tags `sessionKey` (the gateway's persisted `stored_session_id`) as
 * belonging to `vaultPath`. Best-effort — a write failure here must never
 * block chat; the session simply won't be scoped correctly until the next
 * successful tag. */
export function tagSessionProject(sessionKey: string, vaultPath: string): void {
  try {
    saveMap(tagSession(loadMap(), sessionKey, vaultPath))
  } catch (error: unknown) {
    console.error('aecpilot: could not persist chat-session/project tag', error)
  }
}

/** Returns the set of tagged session ids belonging to `vaultPath`, for
 * filtering `session.list`'s results down to the current project (task
 * 1.20). Never throws — an unreadable/corrupt mapping file is treated as
 * "no tags yet". */
export function sessionIdsForProject(vaultPath: string): Set<string> {
  return pureSessionIdsForProject(loadMap(), vaultPath)
}

/** Filters `ids` down to the ones never tagged to any project — used by
 * `sessions:list` when no project is open (review fix, minor 1). Never
 * throws — an unreadable/corrupt mapping file is treated as "no tags yet"
 * (every id passes through untagged). */
export function untaggedSessionIds(ids: string[]): string[] {
  return pureUntaggedSessionIds(loadMap(), ids)
}
