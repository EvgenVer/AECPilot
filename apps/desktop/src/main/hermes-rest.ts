// Transport half of the core's REST client (task 1.6.B2.3) — the part that
// touches `fetch` and therefore cannot be unit-tested without a server; every
// rule it applies lives in `hermes-rest-pure.ts` next to its tests.
//
// Scope (owner decision R1): REST is used ONLY where JSON-RPC does not reach.
// Today that is MCP server CRUD, which has no `mcp.*` methods at all.

import {
  buildRestHeaders,
  buildRestUrl,
  describeRestError,
  extractRestDetail,
  redactSecrets,
  REST_UNAVAILABLE_MESSAGE,
  type RestTarget
} from './hermes-rest-pure'

export { REST_UNAVAILABLE_MESSAGE, type RestTarget }

/** Long enough for their MCP probe (which spawns a server and lists its
 * tools) to be given its own, longer budget below, and short enough that a
 * settings screen never looks frozen. */
const DEFAULT_TIMEOUT_MS = 15000

export interface RestRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string>
  timeoutMs?: number
}

/** One request against the local gateway's REST surface.
 *
 * Failure modes, all turned into `Error` with a message meant for a user:
 * - no local process (e2e override) → `REST_UNAVAILABLE_MESSAGE`
 * - timeout → says so, rather than surfacing `AbortError`
 * - HTTP status → `describeRestError`, with the token and anything key-shaped
 *   redacted out of the core's `detail`
 *
 * The token never appears in the URL — only in the header — so it cannot end
 * up in a log line that prints the request path. */
export async function hermesRest<T = unknown>(
  target: RestTarget | undefined,
  path: string,
  options: RestRequestOptions = {}
): Promise<T> {
  if (!target) throw new Error(REST_UNAVAILABLE_MESSAGE)

  const { method = 'GET', body, query, timeoutMs = DEFAULT_TIMEOUT_MS } = options
  const url = buildRestUrl(target, path, query)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: buildRestHeaders(target, body !== undefined),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal
    })
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error(`Ядро не ответило за ${Math.round(timeoutMs / 1000)} с`)
    }
    const text = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось обратиться к ядру: ${redactSecrets(text, [target.token])}`)
  } finally {
    clearTimeout(timer)
  }

  const raw = await response.text()
  let parsed: unknown = raw
  try {
    parsed = raw === '' ? null : JSON.parse(raw)
  } catch {
    // Left as text: an HTML error page still yields a usable message via
    // `extractRestDetail`'s string branch.
  }

  if (!response.ok) {
    throw new Error(describeRestError(response.status, extractRestDetail(parsed), [target.token]))
  }
  return parsed as T
}
