// WebSocket client for tui_gateway's JSON-RPC 2.0 protocol (task 0.10).
// Transport is the global `WebSocket` — available both in the renderer
// (browser) and in Node 22+ (main process, tests) — no npm ws package.

import type {
  GatewayConnectionState,
  GatewayErrorFrame,
  GatewayEvent,
  GatewayEventFrame,
  GatewayIncomingFrame,
  GatewayMethod,
  GatewayMethodMap,
  GatewayResultFrame,
  GatewayServerRequest,
  GatewayServerRequestFrame,
  GatewayServerRequestParams,
  GatewayServerResponseFrame
} from './types'

export interface GatewayClientOptions {
  url: string
  /** Default timeout (ms) for `request()` calls that don't override it. */
  requestTimeoutMs?: number
  /** Reconnect backoff floor (ms). Default 500. */
  reconnectMinDelayMs?: number
  /** Reconnect backoff cap (ms). Default 8000. */
  reconnectMaxDelayMs?: number
  /** Max consecutive reconnect attempts before giving up. Default Infinity. */
  reconnectMaxAttempts?: number
}

type EventListener = (event: GatewayEvent) => void
type StateListener = (state: GatewayConnectionState) => void
type ServerRequestListener = (request: GatewayServerRequest) => void

const DEFAULT_REQUEST_TIMEOUT_MS = 60000
const DEFAULT_RECONNECT_MIN_DELAY_MS = 500
const DEFAULT_RECONNECT_MAX_DELAY_MS = 8000

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Отказ шлюза с сохранённым КОДОМ и ДАННЫМИ JSON-RPC (находка D-37).
 *
 * Раньше отказ сворачивался в одну строку `gateway error <code>: <message>`, и
 * код с данными оставались только внутри текста. Между тем код донора на них
 * СМОТРИТ: `use-prompt-actions` отличает «сообщение, к которому откатываются,
 * съела компакция» от любого другого отказа по `code === 4018` и читает из
 * `data.segment_ordinal`. Текст сообщения оставлен прежним намеренно — на него
 * смотрят и наши проверки, и разбор чужих отказов по подстроке.
 */
export class GatewayRequestError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(`gateway error ${code}: ${message}`)
    this.name = 'GatewayRequestError'
    this.code = code
    this.data = data
  }
}

/** Parses a raw WS message payload into a gateway frame, or returns
 * `undefined` for anything that isn't a well-formed JSON-RPC frame — such
 * frames are ignored rather than crashing the client. */
function parseFrame(data: unknown): GatewayIncomingFrame | undefined {
  if (typeof data !== 'string') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const frame = parsed as Record<string, unknown>

  // A request FROM the gateway (hermes 0.21.3): string id, a method that is
  // not the event envelope. Checked first — an `event` notification carries
  // no id at all, a response carries no method.
  if (
    typeof frame.id === 'string' &&
    typeof frame.method === 'string' &&
    frame.method !== 'event'
  ) {
    return {
      ...(frame as unknown as GatewayServerRequestFrame),
      params: isRecord(frame.params) ? (frame.params as GatewayServerRequestParams) : {}
    }
  }
  if (frame.method === 'event' && typeof frame.params === 'object' && frame.params !== null) {
    const params = frame.params as Record<string, unknown>
    if (typeof params.type !== 'string') return undefined
    return frame as unknown as GatewayEventFrame
  }
  if (typeof frame.id === 'number') {
    if ('result' in frame) return frame as unknown as GatewayResultFrame
    if ('error' in frame) {
      const err = frame.error
      if (
        typeof err !== 'object' ||
        err === null ||
        typeof (err as Record<string, unknown>).code !== 'number' ||
        typeof (err as Record<string, unknown>).message !== 'string'
      ) {
        return undefined
      }
      return frame as unknown as GatewayErrorFrame
    }
  }
  return undefined
}

/** Type predicate distinguishing an event frame from a response frame. Using
 * a named predicate (rather than an inline `'method' in frame && frame.method
 * === 'event'` check at the call site) narrows the `else` branch down to
 * `GatewayResultFrame | GatewayErrorFrame` — a plain `in`/equality guard
 * does not exclude `GatewayEventFrame` there because it lacks an `id` field
 * altogether rather than merely a mismatched one. */
function isEventFrame(frame: GatewayIncomingFrame): frame is GatewayEventFrame {
  return 'method' in frame && frame.method === 'event'
}

function isServerRequestFrame(frame: GatewayIncomingFrame): frame is GatewayServerRequestFrame {
  return (
    'method' in frame && frame.method !== 'event' && 'id' in frame && typeof frame.id === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The reconnect contract of hermes 0.21.3: `session.resume`, `session.activate`
 * and `session.events.since` answer with `open_requests` — the server→client
 * requests still waiting on that session. They are not events, so the replay
 * ring cannot carry them; the client re-delivers them from the result, marked
 * `replayed`, before the caller sees it. */
function openRequestsOf(result: unknown): GatewayServerRequest[] {
  const open = isRecord(result) ? result.open_requests : undefined
  if (!Array.isArray(open)) return []
  const out: GatewayServerRequest[] = []
  for (const entry of open) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.method !== 'string') {
      continue
    }
    out.push({
      id: entry.id,
      method: entry.method,
      params: isRecord(entry.params) ? (entry.params as GatewayServerRequestParams) : {},
      replayed: true
    })
  }
  return out
}

/** JSON-RPC/WebSocket client for tui_gateway: connect, typed request/response
 * matching, typed event dispatch, and auto-reconnect with backoff. */
export class GatewayClient {
  private readonly url: string
  private readonly defaultRequestTimeoutMs: number
  private readonly reconnectMinDelayMs: number
  private readonly reconnectMaxDelayMs: number
  private readonly reconnectMaxAttempts: number

  private ws: WebSocket | undefined
  private state: GatewayConnectionState = 'closed'
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly eventListeners = new Set<EventListener>()
  private readonly stateListeners = new Set<StateListener>()
  private readonly serverRequestListeners = new Set<ServerRequestListener>()

  private manualClose = false
  private everReady = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private connectResolve: (() => void) | undefined
  private connectReject: ((error: Error) => void) | undefined

  constructor(options: GatewayClientOptions) {
    this.url = options.url
    this.defaultRequestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    this.reconnectMinDelayMs = options.reconnectMinDelayMs ?? DEFAULT_RECONNECT_MIN_DELAY_MS
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
    this.reconnectMaxAttempts = options.reconnectMaxAttempts ?? Infinity
  }

  /** Opens the connection and resolves once the `gateway.ready` event has
   * been received. Rejects if the socket errors/closes before that. */
  connect(): Promise<void> {
    if (this.state !== 'closed') {
      return Promise.reject(
        new Error('connect() called while already connecting/connected; call close() first')
      )
    }
    this.manualClose = false
    this.everReady = false
    return new Promise((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject
      this.openSocket()
    })
  }

  /** Manually closes the connection. Disables auto-reconnect and rejects all
   * pending requests. */
  close(): void {
    this.manualClose = true
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.ws?.close()
    this.ws = undefined
    this.rejectAllPending(new Error('gateway client closed'))
    this.setState('closed')
  }

  /** Sends a typed JSON-RPC request and resolves with its result, or rejects
   * on a JSON-RPC error response or on timeout. */
  request<M extends GatewayMethod>(
    method: M,
    params: GatewayMethodMap[M]['params'],
    timeoutMs = this.defaultRequestTimeoutMs
  ): Promise<GatewayMethodMap[M]['result']> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.state !== 'ready') {
        reject(new Error(`cannot send "${method}" — gateway client is not connected`))
        return
      }
      const ws = this.ws

      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`request "${method}" (id=${id}) timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timer
      })

      try {
        ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error as Error)
      }
    })
  }

  /** Subscribes to typed gateway events. Returns an unsubscribe function. */
  onEvent(callback: EventListener): () => void {
    this.eventListeners.add(callback)
    return () => this.eventListeners.delete(callback)
  }

  /** Subscribes to connection state changes. Returns an unsubscribe function. */
  onStateChange(callback: StateListener): () => void {
    this.stateListeners.add(callback)
    return () => this.stateListeners.delete(callback)
  }

  /** Subscribes to requests the GATEWAY makes of this client (task 3.B5в):
   * live frames and the `open_requests` replayed after a reconnect alike.
   * Every listener sees every request; the answer goes through
   * `respondToServerRequest`, and only the first answer per id reaches the
   * wire. Returns an unsubscribe function. */
  onServerRequest(callback: ServerRequestListener): () => void {
    this.serverRequestListeners.add(callback)
    return () => this.serverRequestListeners.delete(callback)
  }

  /** Answers a server→client request: a response frame with the request's
   * own string id. No promise to settle — the gateway does not acknowledge an
   * answer, and one for an id it no longer holds is dropped on its side
   * (withdrawn by `request.cancel`, or already answered). Returns false when
   * nothing was sent: the socket is gone, or this id was answered already. */
  respondToServerRequest(
    id: string,
    answer: { result: Record<string, unknown> } | { error: { code: number; message: string } }
  ): boolean {
    if (!this.ws || this.state !== 'ready' || this.answeredServerRequests.has(id)) return false
    const frame: GatewayServerResponseFrame = { jsonrpc: '2.0', id, ...answer }
    try {
      this.ws.send(JSON.stringify(frame))
    } catch {
      return false
    }
    this.rememberAnswered(id)
    return true
  }

  private openSocket(): void {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')

    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch (error) {
      this.handleDisconnect(
        new Error(`gateway socket construction failed: ${(error as Error).message}`)
      )
      return
    }
    this.ws = ws

    ws.addEventListener('message', (event: MessageEvent) => {
      this.handleMessage(event.data)
    })

    // A real disconnect fires BOTH `close` and `error`. Gate on socket
    // identity — not just "am I disconnected" — so the paired event (and
    // any late event from a socket already superseded by a reconnect) is
    // ignored: `handleDisconnect` clears `this.ws` on its first run, so by
    // the time the second event arrives `this.ws !== ws` here.
    ws.addEventListener('close', () => {
      if (this.ws === ws) this.handleDisconnect(new Error('gateway connection closed'))
    })

    ws.addEventListener('error', () => {
      if (this.ws === ws) this.handleDisconnect(new Error('gateway connection error'))
    })
  }

  private handleMessage(data: unknown): void {
    const frame = parseFrame(data)
    if (!frame) return // malformed/unrecognized frame — ignore, don't crash

    if (isServerRequestFrame(frame)) {
      this.deliverServerRequest({
        id: frame.id,
        method: frame.method,
        params: frame.params,
        replayed: false
      })
      return
    }

    if (isEventFrame(frame)) {
      const evt = frame.params as GatewayEvent
      if (evt.type === 'gateway.ready') {
        this.everReady = true
        this.reconnectAttempts = 0
        this.setState('ready')
        // С ядра 0.21.5 (задача 3.B6) WebSocket-клиент, который не сказал «я
        // отвечаю на вопросы сервер→клиент», считается сборкой старше этой
        // половины протокола: ядро НЕ шлёт ему ни уточнений, ни подтверждений
        // команд (R21), ни sudo, ни секретов — инструмент сразу получает пустой
        // ответ. Объявление действует на соединение, поэтому шлётся на каждый
        // `gateway.ready`, в том числе после переподключения. Старое ядро
        // отвечает -32601 — это не ошибка.
        this.request('client.capabilities', { server_requests: true }).catch(() => undefined)
        this.connectResolve?.()
        this.connectResolve = undefined
        this.connectReject = undefined
      }
      for (const listener of this.eventListeners) {
        try {
          listener(evt)
        } catch {
          // isolate a bad subscriber — don't let it block the rest, don't
          // log the event payload
          console.error('gateway event listener threw')
        }
      }
      return
    }

    const pending = this.pending.get(frame.id)
    if (!pending) return // response to a request we no longer track (timed out, etc.)
    this.pending.delete(frame.id)
    clearTimeout(pending.timer)

    if ('error' in frame) {
      pending.reject(
        new GatewayRequestError(frame.error.code, frame.error.message, frame.error.data)
      )
    } else {
      // Re-delivered BEFORE the caller sees the result, over the very socket
      // that owns them — the same order as the donor's own channel.
      for (const request of openRequestsOf(frame.result)) this.deliverServerRequest(request)
      pending.resolve(frame.result)
    }
  }

  private deliverServerRequest(request: GatewayServerRequest): void {
    // A replay reuses the id of a request that may have been answered on the
    // old generation; the gateway re-asks, so the id is open again.
    this.answeredServerRequests.delete(request.id)
    for (const listener of this.serverRequestListeners) {
      try {
        listener(request)
      } catch {
        // isolate a bad subscriber — don't log the params (a secret prompt
        // names what is being asked for)
        console.error('gateway server-request listener threw')
      }
    }
  }

  /** Ids already answered, so a second card answering the same question is a
   * no-op here rather than a second frame on the wire. Bounded: the gateway
   * mints one id per question, so the oldest can go once there are many. */
  private readonly answeredServerRequests = new Set<string>()

  private rememberAnswered(id: string): void {
    this.answeredServerRequests.add(id)
    if (this.answeredServerRequests.size > 256) {
      const oldest = this.answeredServerRequests.values().next().value
      if (oldest !== undefined) this.answeredServerRequests.delete(oldest)
    }
  }

  private handleDisconnect(error: Error): void {
    this.ws = undefined
    this.rejectAllPending(error)

    // Only auto-reconnect after a connection that was fully established at
    // least once — a failure during the initial connect() just rejects it.
    if (this.manualClose || !this.everReady) {
      this.connectReject?.(error)
      this.connectReject = undefined
      this.connectResolve = undefined
      this.setState('closed')
      return
    }

    if (this.reconnectAttempts >= this.reconnectMaxAttempts) {
      this.setState('closed')
      return
    }

    this.setState('reconnecting')
    const delay = Math.min(
      this.reconnectMinDelayMs * 2 ** this.reconnectAttempts,
      this.reconnectMaxDelayMs
    )
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      if (this.manualClose) return
      this.openSocket()
    }, delay)
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }

  private setState(state: GatewayConnectionState): void {
    if (this.state === state) return
    this.state = state
    for (const listener of this.stateListeners) {
      try {
        listener(state)
      } catch {
        // isolate a bad subscriber — don't let it block the rest, don't
        // log the state payload
        console.error('gateway state listener threw')
      }
    }
  }
}
