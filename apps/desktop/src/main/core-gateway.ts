// The window's core is the single gateway (task T53.2, decision 0017). This module owns its
// state in main: the endpoint `gateway ensure` answered, the dial of main's socket and the
// auth headers of REST requests — a fresh one-use ticket each time, minted by the core's
// own client over its named pipe. The rules live in `core-gateway-pure.ts` and
// `local-gateway.ts`; processes are started by `runtime/serve.mjs`.
//
// The gateway lives with the window (owner's decision, 0017): started when the app starts,
// stopped with `gateway stop` when it quits — never killed.

import type { GatewayDial } from '../shared/gateway/client'
import type { RestTarget } from './hermes-rest-pure'
import { scopeGatewayRestPath } from './core-gateway-pure'
import { mainT } from './i18n'
import {
  gatewayEndpointFromEnsure,
  isStaleLocalGatewayError,
  nativeGrantPurpose,
  nativeGrantRoute,
  parseGatewayEnsureOutput,
  routedTicketEndpoint,
  staleGatewayCode,
  type GatewayEndpoint,
  type GatewayTicketPurpose
} from './local-gateway'
import {
  closeGatewayTicketBridges,
  mintGatewayTicketWithPython,
  type TicketRuntime
} from './local-gateway-python'

interface VerbResult {
  code: number
  stdout: string
  stderr: string
  ms: number
}

/** The part of `runtime/serve.mjs` this module drives. */
export interface GatewayModule {
  ensureGateway(opts: { extraEnv?: Record<string, string> }): Promise<VerbResult>
  stopGateway(): Promise<VerbResult>
  ticketRuntime(): TicketRuntime
}

type Mint = typeof mintGatewayTicketWithPython

interface State {
  mod: GatewayModule
  /** Re-read on every ensure: a key saved since the last start must reach the next one. */
  extraEnv: () => Record<string, string>
  mint: Mint
  endpoint: GatewayEndpoint | undefined
  /** One ensure at a time: a dial and a REST request that both find the owner gone share it. */
  ensuring: Promise<GatewayEndpoint> | undefined
}

let state: State | undefined

/** Thrown when `stopLocalGateway` retired the state a call was working on: whatever it was
 *  doing must not start a gateway again (an orphan on quit, the old environment on a restart). */
const STOPPED = 'Gateway stopped'

function assertCurrent(current: State): void {
  if (state !== current) throw new Error(STOPPED)
}

export function localGatewayEndpoint(): GatewayEndpoint | undefined {
  return state?.endpoint
}

/** True from the first `ensure` until `stopLocalGateway` — also when that ensure failed or
 *  timed out: a gateway it started may still be coming up, and quitting must stop it. */
export function localGatewayActive(): boolean {
  return state !== undefined
}

async function ensureOnce(current: State): Promise<GatewayEndpoint> {
  assertCurrent(current)
  let result = await current.mod.ensureGateway({ extraEnv: current.extraEnv() })
  assertCurrent(current)
  let payload = parseGatewayEnsureOutput(result)
  const stale = result.code === 0 && payload.state === 'ready' ? staleGatewayCode(payload) : null
  if (stale) {
    // A gateway left running by an earlier build of the core (a crash before an update)
    // answers model calls 503 «Restart required»: replace it once, then take what answers.
    console.warn(
      `aecpilot: the core gateway runs ${stale.gateway}, this core is ${stale.client}; restarting it`
    )
    await current.mod.stopGateway()
    assertCurrent(current)
    result = await current.mod.ensureGateway({ extraEnv: current.extraEnv() })
    assertCurrent(current)
    payload = parseGatewayEnsureOutput(result)
  }
  const endpoint = gatewayEndpointFromEnsure(result, payload)
  current.endpoint = endpoint
  console.log(`aecpilot: core gateway ready in ${result.ms} ms (${endpoint.api_origin})`)
  return endpoint
}

function ensure(current: State): Promise<GatewayEndpoint> {
  current.ensuring ??= ensureOnce(current).finally(() => {
    current.ensuring = undefined
  })
  return current.ensuring
}

/** `gateway ensure` (starts the gateway or finds the running one) → its endpoint. */
export async function startLocalGateway(
  mod: GatewayModule,
  extraEnv: () => Record<string, string>,
  mint: Mint = mintGatewayTicketWithPython
): Promise<GatewayEndpoint> {
  state = { mod, extraEnv, mint, endpoint: undefined, ensuring: undefined }
  for (const wake of startWaiters.splice(0)) wake()
  return ensure(state)
}

/** Base address of a REST target made before the gateway answered; the grant replaces it. */
const PENDING_ORIGIN = 'http://127.0.0.1'
/** How long a REST request made before the gateway was started waits for that start: the
 *  window opens while main still prepares the profile (filters, plugins) before `ensure`. */
export const GATEWAY_START_WAIT_MS = 90_000

let startWaiters: Array<() => void> = []

/** Resolves once `startLocalGateway` has run (at once when it already has). */
export function gatewayStarted(waitMs = GATEWAY_START_WAIT_MS): Promise<void> {
  if (state) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const wake = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      startWaiters = startWaiters.filter((waiter) => waiter !== wake)
      reject(new Error(mainT('common.coreStillStarting')))
    }, waitMs)
    startWaiters.push(wake)
  })
}

/** One more `ensure` of the gateway this app started — after a first start that timed out
 *  (a cold first launch after install can outlast `ensure`'s own 60 s deadline). */
export async function ensureLocalGatewayAgain(): Promise<GatewayEndpoint> {
  if (!state) throw new Error(STOPPED)
  return ensure(state)
}

/** `gateway stop`, then forget the endpoint. Safe to call when nothing was started. Waits for an
 *  `ensure` still under way first: stopping before it finished would answer «not running», and
 *  the gateway it was starting would come up after the app had gone. */
export async function stopLocalGateway(): Promise<void> {
  const current = state
  state = undefined
  closeGatewayTicketBridges()
  if (!current) return
  await current.ensuring?.catch(() => undefined)
  const result = await current.mod.stopGateway()
  if (result.code !== 0) {
    console.warn(
      `aecpilot: gateway stop exit ${result.code}: ${result.stderr.split(/\r?\n/).pop()}`
    )
  }
}

/** A ticket for `purpose`, minted for the profile `route` names (a URL or a profile name).
 *  A mint against a gone owner ensures once more and retries (their `redialLocalGateway`) —
 *  unless the gateway was stopped meanwhile: a stop disposes the helpers, and that refusal
 *  reads like a gone owner too. */
async function ticket(
  route: string,
  purpose: GatewayTicketPurpose,
  method?: string
): Promise<{ endpoint: GatewayEndpoint; ticket: string }> {
  const current = state
  if (!current) throw new Error(STOPPED)
  const mint = async (endpoint: GatewayEndpoint): Promise<string> =>
    current.mint(
      current.mod.ticketRuntime(),
      await routedTicketEndpoint(endpoint, route, method),
      purpose
    )
  const first = current.endpoint ?? (await ensure(current))
  try {
    return { endpoint: first, ticket: await mint(first) }
  } catch (error: unknown) {
    assertCurrent(current)
    if (!isStaleLocalGatewayError(error)) throw error
    current.endpoint = undefined
    closeGatewayTicketBridges()
    const again = await ensure(current)
    return { endpoint: again, ticket: await mint(again) }
  }
}

/** Main's socket: a fresh interactive (host-scoped) ticket per connection attempt. */
export async function gatewayDial(): Promise<GatewayDial> {
  const { endpoint, ticket: granted } = await ticket('', 'interactive')
  return {
    url: `${endpoint.api_origin.replace(/^http/, 'ws')}/api/ws`,
    protocols: ['hermes-gateway-v1', `hermes-gateway-ticket.${granted}`]
  }
}

/** The REST target of the local gateway: the ticket rides `X-Hermes-Gateway-Ticket`, and the
 *  routes that need an explicit profile get the one the window works in. A grant that had to
 *  ensure again answers the new origin too: the ticket is for that gateway, not the old port.
 *
 *  The window asks for REST as soon as it opens — before the gateway was started or while its
 *  first `ensure` still runs. Such a request waits for the gateway (`ticket` ensures when there
 *  is no endpoint yet) instead of failing: the base address is only a placeholder until the
 *  grant answers the real one. */
export function gatewayRestTarget(windowProfile: () => string): RestTarget {
  const endpoint = state?.endpoint
  return {
    host: '',
    port: 0,
    token: '',
    baseUrl: (endpoint?.api_origin ?? PENDING_ORIGIN).replace(/\/$/, ''),
    scopePath: (path, method) => scopeGatewayRestPath(path, method, windowProfile()),
    grant: async (url, method, body) => {
      await gatewayStarted()
      const route = nativeGrantRoute(url, body, method)
      const granted = await ticket(route, nativeGrantPurpose(url, method), method)
      return {
        headers: { 'X-Hermes-Gateway-Ticket': granted.ticket },
        baseUrl: granted.endpoint.api_origin.replace(/\/$/, '')
      }
    }
  }
}
