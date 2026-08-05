// Pure logic for task 1.20's chat-session <-> project scoping, split out
// from session-projects.ts so it can be unit-tested without importing
// `electron` (vitest runs these under plain node) — same split as
// recents.ts / recents-pure.ts (task 1.3).
//
// Why this exists: the gateway persists a `cwd` on every session row (see
// `tui_gateway/server.py::_ensure_session_db_row` in the core checkout), but its `session.list` RPC doesn't surface that
// field — only id/title/preview/started_at/message_count/source. So the
// desktop keeps its own record of which persisted session ids (the
// gateway's `stored_session_id`) it created against which vault, to scope
// the session picker (SessionMenu) per open project.

export type SessionProjectMap = Record<string, string>

/** Parses `chat-sessions-by-project.json` contents, tolerating a missing
 * file (empty string), invalid JSON, a non-object shape, or malformed
 * entries (dropped individually) by returning `{}` (or the valid subset)
 * rather than throwing — a corrupt mapping file must never block chat. */
export function parseSessionProjectsJson(raw: string): SessionProjectMap {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: SessionProjectMap = {}
    for (const [sessionKey, vaultPath] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof vaultPath === 'string') result[sessionKey] = vaultPath
    }
    return result
  } catch {
    return {}
  }
}

/** Tags `sessionKey` (the gateway's persisted `stored_session_id`) as
 * belonging to `vaultPath` — overwrites any previous tag for the same
 * key. */
export function tagSession(
  map: SessionProjectMap,
  sessionKey: string,
  vaultPath: string
): SessionProjectMap {
  return { ...map, [sessionKey]: vaultPath }
}

/** Filters down to the tagged session ids belonging to `vaultPath` —
 * sessions never tagged (created before this feature, or against a
 * different vault) are dropped rather than guessed at. Used to scope
 * `session.list`'s results to the currently open project (task 1.20). */
export function sessionIdsForProject(map: SessionProjectMap, vaultPath: string): Set<string> {
  return new Set(
    Object.entries(map)
      .filter(([, taggedPath]) => taggedPath === vaultPath)
      .map(([sessionKey]) => sessionKey)
  )
}

/** Filters `ids` (session.list's returned `id`s) down to the ones never
 * tagged to ANY project — used with no project open (review fix, minor 1):
 * otherwise every project's sessions show up mixed together at app startup,
 * and clicking one silently resumes a session that belongs to a different
 * vault. Phase 0 sessions and the e2e mock-gateway's session (neither ever
 * tagged) stay visible; a project's sessions hide again the moment that
 * project isn't the open one. */
export function untaggedSessionIds(map: SessionProjectMap, ids: string[]): string[] {
  return ids.filter((id) => !(id in map))
}
