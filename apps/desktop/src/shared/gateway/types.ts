// Protocol types for tui_gateway's JSON-RPC 2.0 / WebSocket wire format.
// Map captured from tui_gateway sources (see AECPilot TASKS.md task 0.8):
//   ws://<host>:<port>/api/ws?token=<token> — newline-delimited JSON-RPC 2.0.
//   First server frame after handshake is always a `gateway.ready` event.
//   Requests: {"jsonrpc":"2.0","id":N,"method":"...","params":{...}}
//   Responses: {"id":N,"result":...} | {"id":N,"error":{code,message}}
//   Events: {"jsonrpc":"2.0","method":"event","params":{"type":"...","payload":{...}}}

/** A request frame this client sends to the gateway. */
export interface GatewayRequestFrame<M extends string = string, P = unknown> {
  jsonrpc: '2.0'
  id: number
  method: M
  params: P
}

/** A successful response frame from the gateway. */
export interface GatewayResultFrame<R = unknown> {
  jsonrpc?: '2.0'
  id: number
  result: R
}

/** A JSON-RPC error object, as carried in an error response frame. */
export interface GatewayRpcError {
  code: number
  message: string
}

/** An error response frame from the gateway (JSON-RPC protocol-level error —
 * distinct from a provider/model error, which arrives as a `message.complete`
 * event with `payload.status === "error"`). */
export interface GatewayErrorFrame {
  jsonrpc?: '2.0'
  id: number
  error: GatewayRpcError
}

/** An event frame pushed by the gateway (not tied to any request id). */
export interface GatewayEventFrame<T extends string = string, P = unknown> {
  jsonrpc?: '2.0'
  method: 'event'
  params: {
    type: T
    session_id?: string
    payload?: P
  }
}

/** Any frame the gateway can send over the WebSocket. */
export type GatewayIncomingFrame = GatewayResultFrame | GatewayErrorFrame | GatewayEventFrame

// ---------------------------------------------------------------------------
// RPC methods: params / result pairs
// ---------------------------------------------------------------------------

export interface SessionCreateParams {
  source: string
  cwd?: string
  model?: string
}

export interface SessionCreateResult {
  session_id: string
  messages: unknown[]
  info: unknown
}

export interface PromptSubmitParams {
  session_id: string
  text: string
}

export interface PromptSubmitResult {
  status: 'streaming'
}

export interface SessionCloseParams {
  session_id: string
}

export interface SessionCloseResult {
  closed: boolean
}

/** Maps each supported RPC method name to its params/result shape. */
export interface GatewayMethodMap {
  'session.create': { params: SessionCreateParams; result: SessionCreateResult }
  'prompt.submit': { params: PromptSubmitParams; result: PromptSubmitResult }
  'session.close': { params: SessionCloseParams; result: SessionCloseResult }
}

export type GatewayMethod = keyof GatewayMethodMap

// ---------------------------------------------------------------------------
// Events: discriminated union on params.type
// ---------------------------------------------------------------------------

export interface GatewayReadyEvent {
  type: 'gateway.ready'
  session_id?: string
  payload?: unknown
}

export interface MessageStartEvent {
  type: 'message.start'
  session_id?: string
  payload?: unknown
}

export interface MessageDeltaEvent {
  type: 'message.delta'
  session_id?: string
  payload: { text: string }
}

export interface ThinkingDeltaEvent {
  type: 'thinking.delta'
  session_id?: string
  payload: { text: string }
}

export interface StatusUpdateEvent {
  type: 'status.update'
  session_id?: string
  payload: { kind: string; text: string }
}

export interface MessageCompleteEvent {
  type: 'message.complete'
  session_id?: string
  payload: {
    text: string
    status: 'complete' | 'error' | 'interrupted'
    usage?: unknown
  }
}

export interface GatewayErrorEvent {
  type: 'error'
  session_id?: string
  payload: { message: string }
}

/** Any event whose `type` this client does not recognize — kept typed rather
 * than silently dropped so callers can decide whether to ignore it. */
export interface UnknownGatewayEvent {
  type: string
  session_id?: string
  payload?: unknown
}

export type GatewayEvent =
  | GatewayReadyEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | ThinkingDeltaEvent
  | StatusUpdateEvent
  | MessageCompleteEvent
  | GatewayErrorEvent
  | UnknownGatewayEvent

/** Narrows a `GatewayEvent` to the known variant matching `type`, if any.
 *
 * A plain `evt.type === 'message.delta'` check does not narrow `payload`
 * here: `UnknownGatewayEvent.type` is `string`, which is not disjoint from
 * any known literal, so TypeScript cannot rule it out as a candidate and
 * `payload` stays `unknown`. This helper uses `Extract<GatewayEvent, {type:
 * T}>` instead, which correctly resolves to just the known event type
 * (since `UnknownGatewayEvent`'s `type: string` isn't assignable to a
 * narrower type literal, `Extract` drops it). */
export function isGatewayEventOfType<T extends GatewayEvent['type']>(
  evt: GatewayEvent | undefined,
  type: T
): evt is Extract<GatewayEvent, { type: T }> {
  return evt?.type === type
}

/** Client connection lifecycle state, reported via `onStateChange`. */
export type GatewayConnectionState = 'connecting' | 'ready' | 'reconnecting' | 'closed'
