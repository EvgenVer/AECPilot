// Transport half of the core's REST client (task 1.6.B2.3) — the part that
// touches the network; every rule it applies lives in `hermes-rest-pure.ts`
// next to its tests.
//
// Scope (owner decision R1): REST is used ONLY where JSON-RPC does not reach.
// Today that is MCP server CRUD, which has no `mcp.*` methods at all.
//
// `node:http`, not `fetch`: Node's `fetch` gives up waiting for response
// headers after 300 s on its own (`UND_ERR_HEADERS_TIMEOUT`, measured
// 30.09.2026), whatever `timeoutMs` says. Their «Запустить сейчас» answers only
// when the routine has finished — minutes — and was cut off as «fetch failed».

import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'

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

  let response: { status: number; raw: string }
  try {
    response = await send(url, {
      method,
      headers: buildRestHeaders(target, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
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

  const { raw } = response
  let parsed: unknown = raw
  try {
    parsed = raw === '' ? null : JSON.parse(raw)
  } catch {
    // Left as text: an HTML error page still yields a usable message via
    // `extractRestDetail`'s string branch.
  }

  if (response.status < 200 || response.status > 299) {
    throw new Error(describeRestError(response.status, extractRestDetail(parsed), [target.token]))
  }
  return parsed as T
}

/** One HTTP exchange with no clock of its own — the caller's `signal` is the
 * only timeout. */
function send(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }
): Promise<{ status: number; raw: string }> {
  const request = url.startsWith('https:') ? httpsRequest : httpRequest
  const headers =
    init.body === undefined
      ? init.headers
      : { ...init.headers, 'Content-Length': String(Buffer.byteLength(init.body)) }
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method, headers, signal: init.signal }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, raw: Buffer.concat(chunks).toString('utf-8') })
      )
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end(init.body)
  })
}
