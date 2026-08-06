// Rules for the generic gateway pass-through that the donor's client rides on
// (task 1.8.5). Pure — every decision is a string check — so it is tested
// without a gateway; the transport half lives in `main/index.ts`.
//
// WHY A GENERIC CHANNEL. The donor's `hermes.ts` is ~200 typed wrappers over a
// single `request(method, params)` call, plus a REST door of the same shape.
// Giving each wrapper a bespoke IPC channel of ours would mean editing every
// one of them — a fifth kind of edit, which is exactly what the donor zone
// exists to prevent (AGENTS §14).
//
// WHAT IT DOES NOT RELAX. The renderer still never learns the gateway's host,
// port or token, never opens a socket (SPEC C9), and cannot reach the two
// plaintext-credential surfaces rule R2 forbids. What it does widen, honestly
// stated: a compromised renderer can now name any gateway method rather than
// only the ~120 operations main used to expose one by one. The gateway is a
// local process running as the user with the user's own files in reach, so the
// win from enumerating methods is small — but it is not zero, and this is the
// place to add a rule if that ever changes.

/** Methods the renderer may never invoke, whatever the donor's code does.
 *
 * `model.save_key` writes a provider key into the core's config in plaintext.
 * Ours live in safeStorage and reach the core only through its spawn env
 * (rule R2), so this method has no legitimate caller here — and a screen that
 * "helpfully" offers it would silently create a second, weaker key store. */
export const DENIED_RPC_METHODS: readonly string[] = ['model.save_key']

/** REST routes the renderer may never reach, by method + path.
 *
 * `POST /api/env/reveal` returns stored secrets as plaintext. Same reasoning
 * as above, from the other end: we never write keys there, and nothing should
 * be able to read them back out through us either. */
export const DENIED_REST_ROUTES: readonly { method: string; path: string }[] = [
  { method: 'POST', path: '/api/env/reveal' }
]

const RPC_METHOD_SHAPE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i
const REST_METHODS = ['GET', 'POST', 'PUT', 'DELETE']

/** Validates an RPC call arriving from the renderer and returns the method
 * name to forward. Throws — the caller turns that into a rejected invoke —
 * when the method is malformed or denied. */
export function checkRpcCall(method: unknown): string {
  if (typeof method !== 'string' || method === '') {
    throw new Error('gateway RPC: method must be a non-empty string')
  }
  if (!RPC_METHOD_SHAPE.test(method)) {
    throw new Error(`gateway RPC: "${method}" is not a gateway method name`)
  }
  if (DENIED_RPC_METHODS.includes(method)) {
    throw new Error(`gateway RPC: "${method}" is not available to the renderer (rule R2)`)
  }
  return method
}

/** Validates a REST call arriving from the renderer and returns the method and
 * path to forward. The path is required to be under `/api/` and free of `..`:
 * not a trust boundary (everything on that host is the same local core), but
 * it keeps the channel to the surface this adapter is documented to carry. */
export function checkRestCall(method: unknown, path: unknown): { method: string; path: string } {
  if (typeof path !== 'string' || !path.startsWith('/api/')) {
    throw new Error(`gateway REST: path must start with "/api/": ${String(path)}`)
  }

  const normalized = typeof method === 'string' ? method.toUpperCase() : 'GET'
  if (!REST_METHODS.includes(normalized)) {
    throw new Error(`gateway REST: unsupported method ${String(method)}`)
  }

  const route = path.split(/[?#]/, 1)[0]
  if (route.split('/').includes('..')) {
    throw new Error(`gateway REST: illegal path traversal in "${path}"`)
  }
  if (DENIED_REST_ROUTES.some((d) => d.method === normalized && d.path === route)) {
    throw new Error(
      `gateway REST: ${normalized} ${route} is not available to the renderer (rule R2)`
    )
  }

  return { method: normalized, path }
}

/** A known core regression, translated for the person reading the dialog.
 *
 * Measured on 0.20.0 (D-14): `DELETE /api/profiles/<name>` answers 500 and
 * leaves the profile in place when a session was created for that profile in
 * the SAME `hermes serve` process — its `state.db` handle is still open, and
 * Windows refuses the unlink (WinError 32). Their `_stop_profile_backends`
 * stops OTHER processes' backends, not its own connection.
 *
 * We do not restart the gateway to work around it: that would kill the live
 * session to delete a profile, which is out of proportion. So the honest
 * answer is the one the user can act on — close the session, or restart the
 * app, then try again.
 *
 * Returns the replacement message, or null when this is some other failure and
 * the original error should stand. */
export function explainProfileDeleteFailure(
  method: string,
  path: string,
  message: string
): string | null {
  if (method !== 'DELETE' || !/^\/api\/profiles\/[^/]+$/.test(path.split(/[?#]/, 1)[0])) {
    return null
  }
  // Only the in-use case: anything else (unknown profile, bad name) already
  // says something useful on its own.
  if (!/500|WinError 32|being used by another process|in use/i.test(message)) return null

  return (
    'Профиль не удалён: ядро держит его базу открытой, пока в этом запуске ' +
    'была сессия этого профиля. Закройте сессию и перезапустите приложение, ' +
    'затем повторите удаление.'
  )
}
