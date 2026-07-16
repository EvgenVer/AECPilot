// Pure logic for task 1.3's "recent projects" list, split out from
// recents.ts so it can be unit-tested without importing `electron` (vitest
// runs these under plain node) — same split as llm-settings.ts /
// llm-settings-pure.ts (task 0.15).

import { normalize } from 'node:path'

export interface RecentProject {
  name: string
  vaultPath: string
  openedAt: string
}

/** Max number of entries kept in the recents list. */
const MAX_RECENTS = 10

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== 'object' || value === null) return false
  const { name, vaultPath, openedAt } = value as Record<string, unknown>
  return typeof name === 'string' && typeof vaultPath === 'string' && typeof openedAt === 'string'
}

/** Parses `recent-projects.json` contents, tolerating a missing file (empty
 * string), invalid JSON, a non-array shape, or malformed entries (dropped
 * individually) by returning `[]` (or the valid subset) rather than throwing
 * — a corrupt recents file must never block creating or opening a project. */
export function parseRecentsJson(raw: string): RecentProject[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecentProject)
  } catch {
    return []
  }
}

/** Normalizes a `vaultPath` for de-duplication comparison only (never used
 * for the stored/displayed value): `path.normalize` (resolves `.`/`..` and,
 * on Windows, converts `/` to `\`), then strips a single trailing separator,
 * then lowercases — so `C:\vaults\a`, `C:/vaults/a`, and `C:\vaults\a\` all
 * collapse to the same key. */
function normalizePathForCompare(vaultPath: string): string {
  let normalized = normalize(vaultPath)
  if (normalized.length > 1 && (normalized.endsWith('\\') || normalized.endsWith('/'))) {
    normalized = normalized.slice(0, -1)
  }
  return normalized.toLowerCase()
}

/** Adds `entry` to the front of `list` (most-recently-used order),
 * de-duplicating by `vaultPath` (normalized — see `normalizePathForCompare`)
 * and capping the result at `MAX_RECENTS` entries. */
export function addRecent(list: RecentProject[], entry: RecentProject): RecentProject[] {
  const entryKey = normalizePathForCompare(entry.vaultPath)
  const deduped = list.filter((p) => normalizePathForCompare(p.vaultPath) !== entryKey)
  return [entry, ...deduped].slice(0, MAX_RECENTS)
}
