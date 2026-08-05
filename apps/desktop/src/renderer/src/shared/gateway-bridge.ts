// The one seam the donor's code is always edited at (PLAN §Слой донора, edit
// kind 1): their gateway client opens a WebSocket from the renderer and holds
// the session token to do it. SPEC C9 says our renderer does neither — main
// owns the socket, the host, the port and the token — so their client class is
// replaced by this one, which presents the SAME surface over our IPC bridge.
// Their ~200 typed wrappers (`donor/hermes.ts`) then work unedited, and the
// alias `@hermes/shared` (electron.vite.config.ts) is what swaps the class in.
//
// Their surface, matched member for member and signature for signature:
//   request(method, params?, timeoutMs?, signal?)
//   on(type, handler) / onAny / onEvent / onState
//   connect(wsUrl) / close() / connectionState
//
// `connect` and `close` are no-ops on purpose: the connection is main's, it is
// already up (or reconnecting) before the window exists, and no renderer is
// allowed to decide otherwise. One consequence to know about: their
// multi-profile socket pool (`donor/store/gateway.ts`) opens one client per
// profile, but every instance here listens to main's single event stream. It
// stays correct only because the pool asks `hermesDesktop.getConnection()`
// first, and our shim answers null for secondaries — see hermes-desktop-shim.

import type { GatewayConnectionState, GatewayEvent } from '../../../shared/gateway/types'

/** Their state vocabulary, which their components switch on. */
export type DonorConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

/** Their client's constructor options. Every one of them describes socket
 * behavior we do not have here; accepted and ignored so their subclass
 * (`HermesGateway`) constructs unedited. */
export interface GatewayClientOptions {
  closedErrorMessage?: string
  connectErrorMessage?: string
  connectTimeoutMs?: number
  createRequestId?: (nextId: number) => number | string
  notConnectedErrorMessage?: string
  requestIdPrefix?: string
  requestTimeoutMs?: number
}

export interface RestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  timeoutMs?: number
}

/** 'reconnecting' maps to 'connecting' rather than 'error': their components
 * treat 'error' as terminal (they stop retrying and show a failure), while our
 * client is mid-backoff and will come back on its own. */
export function toDonorState(state: GatewayConnectionState): DonorConnectionState {
  switch (state) {
    case 'ready':
      return 'open'
    case 'connecting':
    case 'reconnecting':
      return 'connecting'
    case 'closed':
      return 'closed'
  }
}

type EventHandler = (event: GatewayEvent) => void

const ANY = '*'

export class GatewayBridge {
  private state: GatewayConnectionState = 'closed'
  private readonly handlers = new Map<string, Set<EventHandler>>()
  private readonly stateHandlers = new Set<(state: DonorConnectionState) => void>()
  private readonly disposers: (() => void)[] = []
  private readonly api: Window['aecpilot']

  constructor(optionsOrApi?: GatewayClientOptions | Window['aecpilot']) {
    // Their subclass passes options; our tests pass a stub API. Telling them
    // apart by a member no options object has keeps both call sites honest.
    this.api =
      optionsOrApi && 'gatewayRpc' in optionsOrApi
        ? (optionsOrApi as Window['aecpilot'])
        : window.aecpilot

    this.disposers.push(
      this.api.onChatEvent((event) => {
        this.dispatch(event)
      }),
      this.api.onGatewayState((state) => {
        this.setState(state)
      })
    )
    // Main can reach 'ready' before this renderer mounts, so the push channel
    // alone would leave every consumer stuck at 'closed'.
    void this.api.getGatewayState().then((state) => {
      this.setState(state)
    })
  }

  get connectionState(): DonorConnectionState {
    return toDonorState(this.state)
  }

  /** No-op: main owns the connection. Kept async and argument-taking so their
   * boot and pool code, which awaits `connect(wsUrl)`, runs unedited — the URL
   * is theirs to compute and ours to ignore. */
  async connect(_wsUrl?: string): Promise<void> {}

  /** No-op, for the same reason — a renderer closing main's socket would take
   * the connection away from every other window. */
  close(): void {}

  request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    const call = this.api.gatewayRpc<T>(method, params, timeoutMs)
    if (!signal) return call

    // The IPC call itself cannot be cancelled — main will finish it and drop
    // the result. Abort only settles the promise the caller is waiting on,
    // which is all their callers use it for (a component unmounting).
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => reject(new DOMException('Aborted', 'AbortError'))
      signal.addEventListener('abort', onAbort, { once: true })
      call.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  /** Subscribes to one event type. Returns an unsubscribe function. */
  on(type: string, handler: EventHandler): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>()
    set.add(handler)
    this.handlers.set(type, set)
    return () => {
      set.delete(handler)
    }
  }

  /** Subscribes to every event. */
  onAny(handler: EventHandler): () => void {
    return this.on(ANY, handler)
  }

  /** Their alias for `onAny`. */
  onEvent(handler: EventHandler): () => void {
    return this.on(ANY, handler)
  }

  /** Subscribes to connection-state changes, and fires once immediately with
   * the current state — their components rely on that first call. */
  onState(handler: (state: DonorConnectionState) => void): () => void {
    this.stateHandlers.add(handler)
    handler(this.connectionState)
    return () => {
      this.stateHandlers.delete(handler)
    }
  }

  /** One REST call against the same process, for the routes JSON-RPC does not
   * cover. Not part of their client's surface — their REST goes through
   * `window.hermesDesktop.api`, which our shim routes here. */
  rest<T = unknown>(path: string, options: RestOptions = {}): Promise<T> {
    return this.api.gatewayRest<T>(path, options)
  }

  /** Drops every IPC subscription this bridge holds. */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.handlers.clear()
    this.stateHandlers.clear()
  }

  private setState(state: GatewayConnectionState): void {
    this.state = state
    const mapped = toDonorState(state)
    for (const handler of this.stateHandlers) handler(mapped)
  }

  private dispatch(event: GatewayEvent): void {
    for (const handler of this.handlers.get(event.type) ?? []) handler(event)
    for (const handler of this.handlers.get(ANY) ?? []) handler(event)
  }
}

let shared: GatewayBridge | undefined

/** The process-wide bridge. Created lazily so a test can construct its own
 * against a stub API without the module import having already touched
 * `window.aecpilot`. */
export function gatewayBridge(): GatewayBridge {
  shared ??= new GatewayBridge()
  return shared
}
