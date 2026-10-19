// Pure half of the core's REST client (task 1.6.B2.3). No `fetch`, no
// electron, no process state — so every rule below is pinned by node tests
// rather than by reading the transport.
//
// Why there is a second transport at all: `hermes serve` is an alias for their
// `dashboard` command, so the SAME process serves JSON-RPC over WebSocket and
// a REST API on the same host/port with the same token. Some things exist only
// there — there are no `mcp.*` RPC methods at all, MCP server CRUD is REST or
// nothing. Owner decision R1: REST is used only where RPC does not reach;
// anything RPC covers keeps going over RPC.

import { mainT } from './i18n'

/** Everything the client needs to address the local gateway — the same
 * `{host, port, token}` `runtime/serve.mjs` already hands back from
 * `startServe`. */
export interface RestTarget {
  host: string
  port: number
  token: string
  /** Полный базовый адрес — задан только у УДАЛЁННОГО ядра (задача 3.12).
   * Локальное всегда `http://host:port`, а удалённое может стоять за TLS, и
   * собирать его схему из полей значило бы догадываться. */
  baseUrl?: string
}

/** Their auth header. The legacy `Bearer` form is also accepted by the server,
 * but this one is what their own desktop sends, and it keeps the token out of
 * any header a proxy might log by convention. */
export const SESSION_TOKEN_HEADER = 'X-Hermes-Session-Token'

/** Builds the absolute URL for one API path.
 *
 * `path` is expected to start with `/api/`; a missing leading slash is a
 * caller bug, not something to paper over silently, so it is rejected rather
 * than fixed up — a URL assembled from a mistyped path would 404 in a way that
 * reads like a server problem. */
export function buildRestUrl(
  target: RestTarget,
  path: string,
  query?: Record<string, string>
): string {
  if (!path.startsWith('/')) throw new Error(`REST path must start with "/": ${path}`)
  const url = new URL(`${target.baseUrl ?? `http://${target.host}:${target.port}`}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

export function buildRestHeaders(target: RestTarget, hasBody: boolean): Record<string, string> {
  return {
    [SESSION_TOKEN_HEADER]: target.token,
    Accept: 'application/json',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {})
  }
}

/** Strips anything that looks like a credential out of text that is about to
 * be shown or logged.
 *
 * This is belt-and-braces: the messages this runs on are FastAPI `detail`
 * strings, which are not supposed to echo secrets. But the one place a `detail`
 * definitely can carry user input is the MCP server form — whose `env` map is
 * exactly where an API key would be typed — so the failure mode is real, and
 * an over-eager redaction costs nothing next to a key in a log file.
 *
 * `extra` lets the caller add the session token, which is not shaped like any
 * of the patterns below. */
export function redactSecrets(text: string, extra: string[] = []): string {
  let out = text
  for (const secret of extra) {
    if (secret && secret.length >= 8) out = out.split(secret).join(mainT('rest.redacted'))
  }
  return (
    out
      // Provider key prefixes: sk-…, sk-ant-…, ghp_…, xoxb-… and friends.
      .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, mainT('rest.redacted'))
      .replace(/\b(gh[pousr]|xox[baprs])[-_][A-Za-z0-9_-]{8,}/g, mainT('rest.redacted'))
      // Bare high-entropy strings: 24+ hex or base64url characters in a row.
      .replace(/\b[0-9a-fA-F]{24,}\b/g, mainT('rest.redacted'))
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, mainT('rest.redacted'))
  )
}

/** Turns an HTTP failure into a sentence a user can act on.
 *
 * Each status gets its own wording because they mean genuinely different
 * things here and a single "ошибка сервера" would hide the actionable half:
 * 401 is our token (a restart fixes it), 404 is a name that no longer exists
 * (the list is stale), 409 is a name collision (pick another), 400 is the
 * core's own validation — including its anti-injection refusal of a suspicious
 * MCP command, which is a security decision and must not read as a crash. */
export function describeRestError(status: number, detail: string, tokens: string[] = []): string {
  const clean = redactSecrets(detail.trim(), tokens)
  const suffix = clean === '' ? '' : `: ${clean}`
  if (status === 400) return mainT('rest.badRequest', suffix)
  if (status === 401 || status === 403) {
    return mainT('rest.tokenRejected')
  }
  if (status === 404) return mainT('rest.notFound', suffix)
  if (status === 409) return mainT('rest.exists', suffix)
  if (status === 422) return mainT('rest.invalidForm', suffix)
  if (status >= 500) return mainT('rest.serverError', status, suffix)
  return mainT('rest.rejected', status, suffix)
}

/** Pulls FastAPI's error text out of a parsed body.
 *
 * `detail` is either a string or the list of field errors pydantic produces
 * for a 422; both have to survive, because "which field" is the whole content
 * of a validation failure. Anything else (an HTML error page, an empty body)
 * yields '' — the status alone still produces a usable message. */
export function extractRestDetail(body: unknown): string {
  if (typeof body === 'string') return body
  if (body === null || typeof body !== 'object') return ''
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const loc = (item as { loc?: unknown }).loc
          const msg = (item as { msg?: unknown }).msg
          const field = Array.isArray(loc) ? loc.filter((p) => typeof p === 'string').join('.') : ''
          return field ? `${field}: ${String(msg ?? '')}` : String(msg ?? '')
        }
        return ''
      })
      .filter((line) => line !== '')
      .join('; ')
  }
  return ''
}

/** The message for "there is no local gateway process to talk to".
 *
 * Under the e2e override (`AEC_GATEWAY_URL`) the app connects to a mock
 * gateway that speaks JSON-RPC only — there is no REST surface and no token
 * behind it. Saying so out loud beats a connection error that looks like the
 * user's machine is broken. */
export const REST_UNAVAILABLE_MESSAGE =
  'REST-интерфейс ядра недоступен: приложение подключено к внешнему шлюзу (e2e-режим), собственный процесс hermes не запущен'
