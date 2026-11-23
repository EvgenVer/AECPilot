/**
 * Ported from Hermes Desktop (decision 0017: the window on the core's single gateway).
 * Source:  apps/desktop/electron/local-gateway.ts and apps/desktop/electron/profile-routes.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (shipped in THIRD-PARTY-NOTICES.txt with the core)
 * This is main-process code, not the donor zone: only the parts our Windows app needs,
 * kept in their shape so a pin raise can be diffed against the source.
 * Edits:
 *   - `runGatewayEnsure` is not here: `runtime/serve.mjs::ensureGateway` spawns the
 *     client with our core and our environment;
 *   - `ensureLocalGateway` keeps only the verdict check (`gatewayEndpointFromEnsure`); the
 *     stale-owner restart is ours (`staleGatewayCode` → stop and ensure again) because our
 *     gateway lives with the window (owner's decision, 0017);
 *   - minting is Windows-only (their Python client over the validated named pipe): the
 *     POSIX socket path, `privateNode` and `posixRealpath` are dropped;
 *   - the WebSocket dial table (`createLocalGatewayDials`) is dropped: the socket is
 *     main's (SPEC C9), the ticket goes straight into its subprotocols.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

// --- profile-routes.ts -------------------------------------------------------------------

/** `/api/profiles/<suffix>` collection routes, by method (hermes_cli/web_routers/profiles.py). Any
 *  other method on these paths is the per-profile `/api/profiles/{name}` route of a profile NAMED
 *  `active`, `import`, `sessions`, …, which are valid profile names. */
const PROFILE_COLLECTION_ROUTES: Readonly<Record<string, readonly string[]>> = {
  active: ['GET', 'POST'],
  import: ['POST'],
  'projects/tree': ['GET'],
  sessions: ['GET'],
  'sessions/pull-requests': ['POST'],
  'sessions/sidebar': ['GET']
}

/** The `/api/profiles/` suffix of *pathname* (trailing slashes dropped), or '' for any other path. */
export function profileRouteSuffix(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '')

  return trimmed.startsWith('/api/profiles/') ? trimmed.slice('/api/profiles/'.length) : ''
}

/** The collection `method pathname` serves, or null when the path names a profile. */
export function profileCollectionRoute(pathname: string, method?: string): null | string {
  const suffix = profileRouteSuffix(pathname)

  if (!suffix || !Object.hasOwn(PROFILE_COLLECTION_ROUTES, suffix)) {
    return null
  }

  return method === undefined || PROFILE_COLLECTION_ROUTES[suffix].includes(method.toUpperCase())
    ? suffix
    : null
}

// --- local-gateway.ts --------------------------------------------------------------------

export interface GatewayEndpoint {
  profile_id: string
  instance_id: string
  authority_epoch: number
  runtime_protocol: number
  api_origin: string
  capabilities: string[]
  supervisor: string
  /** Multiplexer home whose control socket answers for a served secondary. */
  control_home?: string | null
  /** Commit the owner booted from; null when it cannot name one. */
  code_sha?: string | null
}

/** Every purpose a Desktop mints a gateway ticket for (gateway/runtime_bootstrap.py). */
export type GatewayTicketPurpose =
  'interactive' | 'native-http' | 'native-profile-create' | 'native-profile-registry'

/** The single-line JSON `hermes gateway ensure --json` prints, or a diagnosis of why there is none. */
export function parseGatewayEnsureOutput(result: {
  code: number
  stdout: string
  stderr?: string
}): Record<string, unknown> {
  try {
    const payload = JSON.parse(result.stdout)

    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return payload
    }
  } catch {
    /* diagnosed below */
  }

  const reason = String(result.stderr ?? '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .pop()

  throw new Error(
    `hermes gateway ensure produced no result (exit ${result.code})${reason ? `: ${reason}` : ''}.`
  )
}

/** `{ gateway, client }` commits when a ready owner provably runs other code than the ensure
 *  client; null when they match or either side cannot name its code. */
export function staleGatewayCode(
  payload: Record<string, unknown>
): { gateway: string; client: string } | null {
  const gateway = (payload?.endpoint as { code_sha?: unknown } | undefined)?.code_sha
  const client = payload?.client_code_sha

  if (typeof gateway !== 'string' || !gateway || typeof client !== 'string' || !client) {
    return null
  }

  return gateway.toLowerCase() === client.toLowerCase() ? null : { gateway, client }
}

/** Loopback-only, bare-origin, session-authority endpoint or throw (C11). */
export function assertLocalGatewayEndpoint(endpoint: GatewayEndpoint): void {
  const origin = new URL(endpoint.api_origin)

  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    !['127.0.0.1', '[::1]'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !origin.port ||
    endpoint.runtime_protocol !== 1 ||
    !endpoint.instance_id ||
    !endpoint.profile_id ||
    !Array.isArray(endpoint.capabilities) ||
    !endpoint.capabilities.includes('session-authority-v1')
  ) {
    throw new Error('Invalid local gateway endpoint')
  }
}

/** `ensureLocalGateway`'s verdict check: the endpoint of a READY owner, or an error that names
 *  the state and the reason the core gave. */
export function gatewayEndpointFromEnsure(
  result: { code: number; stdout: string; stderr?: string },
  payload: Record<string, unknown>
): GatewayEndpoint {
  if (result.code !== 0 || payload.state !== 'ready') {
    const detail =
      typeof payload.detail === 'string' && payload.detail.trim()
        ? ` ${payload.detail.trim().split(/\r?\n/)[0]}.`
        : ''
    throw new Error(
      `Gateway ${String(payload.state || 'inaccessible')} (${String(payload.reason_code || 'ensure_failed')}).${detail}`
    )
  }

  const endpoint = payload.endpoint as GatewayEndpoint
  assertLocalGatewayEndpoint(endpoint)

  return endpoint
}

// The cached endpoint pins the gateway instance that answered the first `gateway ensure`. When
// that owner is gone (crash, `gateway stop`) every ticket mint against it fails: forget it once
// and ensure again.
const STALE_CONTROL_ERRORS = new Set([
  'Invalid gateway ticket response',
  'Invalid gateway control pointer',
  'Noncanonical gateway profile'
])

export function isStaleLocalGatewayError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')

  return message.startsWith('Gateway ticket') || STALE_CONTROL_ERRORS.has(message)
}

/** The batched sidebar names its owner in `recents_profile`. A named profile route carries its
 *  owner in the first path segment; all other profile-scoped routes use `profile`. */
function scopedProfileOf(url: URL, method?: string): null | string {
  const collection = profileCollectionRoute(url.pathname, method)

  if (collection === 'sessions/sidebar') {
    return url.searchParams.get('recents_profile')
  }

  const segment = profileRouteSuffix(url.pathname).split('/', 1)[0]

  if (segment && !collection) {
    try {
      return decodeURIComponent(segment)
    } catch {
      return null
    }
  }

  return url.searchParams.get('profile')
}

/** The endpoint a `?profile=<name>` request is scoped to: the same daemon, ticket minted for
 *  the sibling profile's home (`profiles/<name>` under the launch root). The gateway refuses a
 *  ticket whose profile it does not serve, so a bad name fails closed. */
export function routedGatewayEndpoint(
  endpoint: GatewayEndpoint,
  urlOrProfile: string,
  method?: string
): GatewayEndpoint {
  const profile = (
    /^[a-z]+:\/\//.test(urlOrProfile)
      ? scopedProfileOf(new URL(urlOrProfile), method)
      : urlOrProfile
  )?.trim()

  if (!profile || profile === 'current') {
    return endpoint
  }

  const own = path.basename(endpoint.profile_id)
  const ownName = path.basename(path.dirname(endpoint.profile_id)) === 'profiles' ? own : 'default'

  if (profile === ownName) {
    return endpoint
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile)) {
    throw new Error('Invalid profile route')
  }

  const root =
    path.basename(path.dirname(endpoint.profile_id)) === 'profiles'
      ? path.dirname(path.dirname(endpoint.profile_id))
      : endpoint.profile_id
  const home = profile === 'default' ? root : path.join(root, 'profiles', profile)

  return {
    ...endpoint,
    profile_id: home,
    control_home: endpoint.control_home || endpoint.profile_id
  }
}

/** `routedGatewayEndpoint` bound to the home the gateway reserved for the routed profile: on
 *  Windows its `Path.resolve()` is the final on-disk path, as Node's realpath is. */
export async function routedTicketEndpoint(
  endpoint: GatewayEndpoint,
  urlOrProfile: string,
  method?: string
): Promise<GatewayEndpoint> {
  const routed = routedGatewayEndpoint(endpoint, urlOrProfile, method)

  if (routed.profile_id === endpoint.profile_id || routed.profile_id === routed.control_home) {
    return routed
  }

  const home = await fs.realpath(routed.profile_id).catch((error: NodeJS.ErrnoException) => {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw new Error(
        `Profile '${path.basename(routed.profile_id)}' does not exist: no directory at ${routed.profile_id}`
      )
    }
    throw error
  })

  return { ...routed, profile_id: home }
}

/** The native grant a REST request needs. Creating a profile and renaming/deleting the one a path
 *  names are registry operations with grants of their own; every other route is `native-http`. */
export function nativeGrantPurpose(url: string, method = 'GET'): GatewayTicketPurpose {
  const verb = method.toUpperCase()
  const pathname = new URL(url).pathname.replace(/\/+$/, '')

  if (verb === 'POST' && pathname === '/api/profiles') {
    return 'native-profile-create'
  }

  const suffix = profileRouteSuffix(pathname)

  if (
    (verb === 'PATCH' || verb === 'DELETE') &&
    suffix &&
    !suffix.includes('/') &&
    !profileCollectionRoute(pathname, verb)
  ) {
    return 'native-profile-registry'
  }

  return 'native-http'
}

/** What a native grant is minted for: the URL's own profile selector or, when it names none, a
 *  JSON body's `profile`. The gateway checks both against the grant. */
export function nativeGrantRoute(url: string, body?: unknown, method?: string): string {
  if (scopedProfileOf(new URL(url), method)?.trim()) {
    return url
  }

  const profile =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { profile?: unknown }).profile
      : undefined

  return typeof profile === 'string' && profile.trim() ? profile : url
}

/** The Desktop's interactive socket is host-scoped: its renderer selects every served sibling
 *  with a `profile` param. Every other ticket stays bound to the one profile it names. */
export function ticketScope(purpose: GatewayTicketPurpose): { scope?: 'host' } {
  return purpose === 'interactive' ? { scope: 'host' } : {}
}
