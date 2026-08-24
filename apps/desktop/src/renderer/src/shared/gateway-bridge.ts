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
// profile, and every instance here listens to main's single event stream — so
// the pool collapses into N aliases of one connection. That is harmless
// because profile routing does not live in the socket here: `switchProfile`
// calls `hermesDesktop.profile.set` → `profiles:use` in main, which moves new
// and resumed sessions with the `profile` parameter on session.create/resume
// (task 1.6.B5.23, owner decision B5-1=C). Do NOT read
// `hermesDesktop.getConnection()` as the guard that makes this safe: it hands
// back the same descriptor for every profile, secondaries included, and never
// null. Pinned by `hermes-desktop-shim.test.ts`.

import type { GatewayRpcOutcome } from '../../../shared/ipc'
import type { GatewayConnectionState, GatewayEvent } from '../../../shared/gateway/types'

/**
 * Отказ шлюза в ИХ форме. Класс жил только внутри их невендоренного
 * `json-rpc-gateway.ts`, и их код на него смотрит: `use-prompt-actions`
 * спрашивает `err instanceof JsonRpcGatewayError && err.code === 4018`, чтобы
 * отличить «сообщение, к которому откатываются, съела компакция» от любого
 * другого отказа, и читает `data.segment_ordinal`.
 *
 * Живёт здесь, а не в `hermes-shared/index.ts`, потому что бросает его этот
 * файл: обратный порядок дал бы кольцо импортов (`hermes-shared` уже
 * реэкспортирует отсюда `GatewayBridge`). Под именем `@hermes/shared` он
 * по-прежнему доступен — там стоит реэкспорт.
 */
export class JsonRpcGatewayError extends Error {
  readonly code?: number
  readonly data?: unknown

  constructor(message: string, options?: { code?: number; data?: unknown }) {
    super(message)
    this.name = 'JsonRpcGatewayError'
    this.code = options?.code
    this.data = options?.data
  }
}

/** Итог вызова из главного процесса — обратно в значение или в исключение
 * (находка D-37). Отказ едет через IPC данными, потому что `invoke` доносит
 * только текст; здесь он снова становится ошибкой, и код с данными при нём. */
export function unwrapRpcOutcome<T>(outcome: GatewayRpcOutcome<T>): T {
  if (outcome.ok) return outcome.value
  throw new JsonRpcGatewayError(outcome.error.message, {
    code: outcome.error.code,
    data: outcome.error.data
  })
}

/** Their event envelope. Generic in the payload because their code annotates
 * per-subscription (`on<{ done?: string }>('pet.hatch.progress', …)`), and
 * carrying `profile` because their multi-backend registry tags events with it. */
export interface DonorGatewayEvent<P = unknown> {
  payload?: P
  profile?: string
  session_id?: string
  type: string
}

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

type EventHandler = (event: DonorGatewayEvent) => void

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
      this.api.onChatEvent((event: GatewayEvent) => {
        this.dispatch(event as DonorGatewayEvent)
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

    const call = this.api.gatewayRpc<T>(method, params, timeoutMs).then(unwrapRpcOutcome<T>)
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
  on<P = unknown>(type: string, handler: (event: DonorGatewayEvent<P>) => void): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>()
    set.add(handler as EventHandler)
    this.handlers.set(type, set)
    return () => {
      set.delete(handler as EventHandler)
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

  private dispatch(event: DonorGatewayEvent): void {
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
