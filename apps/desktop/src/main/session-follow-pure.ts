// D-98 (task 3F.7): which of the window's own gateway calls name the session
// the person is looking at, and what to adopt from the answer. Pure so the
// rule is pinned by a unit test; the state change itself lives in index.ts.

/** Their calls whose answer carries the session that just became current. */
export const WINDOW_SESSION_METHODS: ReadonlySet<string> = new Set([
  'session.create',
  'session.activate',
  'session.resume'
])

/** The session id main should follow after `method` answered `value`, or
 * `null` when there is nothing to adopt: a different method, a malformed
 * answer, or the session main already addresses. */
export function sessionToFollow(
  method: string,
  value: unknown,
  current: string | undefined
): string | null {
  if (!WINDOW_SESSION_METHODS.has(method)) return null
  if (typeof value !== 'object' || value === null) return null
  const id = (value as { session_id?: unknown }).session_id
  if (typeof id !== 'string' || id === '' || id === current) return null
  return id
}
