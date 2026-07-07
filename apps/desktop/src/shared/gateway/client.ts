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
  GatewayResultFrame
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

const DEFAULT_REQUEST_TIMEOUT_MS = 60000
const DEFAULT_RECONNECT_MIN_DELAY_MS = 500
const DEFAULT_RECONNECT_MAX_DELAY_MS = 8000

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
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

    if (isEventFrame(frame)) {
      const evt = frame.params as GatewayEvent
      if (evt.type === 'gateway.ready') {
        this.everReady = true
        this.reconnectAttempts = 0
        this.setState('ready')
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
      pending.reject(new Error(`gateway error ${frame.error.code}: ${frame.error.message}`))
    } else {
      pending.resolve(frame.result)
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
