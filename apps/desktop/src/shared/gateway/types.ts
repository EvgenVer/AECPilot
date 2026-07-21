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
  /** The gateway's persisted id for this session (task 1.20) — distinct from
   * `session_id` above (a fresh, ephemeral live-session id every call): this
   * is the one `session.list`/`session.resume` address, and the one the
   * desktop tags to the current project's vault (see
   * `main/session-projects.ts`). Optional because the e2e mock gateway
   * doesn't return it — every consumer must tolerate its absence. */
  stored_session_id?: string
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

/** Approvals form a FIFO queue per session — there is no request id. A
 * `choice` of 'always' must only be sent when the matching
 * `ApprovalRequestEvent.payload.allow_permanent` was true. */
export interface ApprovalRespondParams {
  session_id: string
  choice: 'once' | 'session' | 'always' | 'deny'
  all?: boolean
}

/** `resolved` is how many pending approvals this call resolved (0 = nothing
 * was pending). */
export interface ApprovalRespondResult {
  resolved: number
}

/** One entry in `session.list`'s result — the gateway already filters out
 * internal 'tool' sub-agent sessions. */
export interface SessionSummary {
  id: string
  title: string
  preview: string
  started_at: number
  message_count: number
  source: string
}

export interface SessionListParams {
  limit?: number
}

export interface SessionListResult {
  sessions: SessionSummary[]
}

/** One entry in a session's history, as returned by `session.history` /
 * `session.resume`. Kept tolerant (all fields optional besides `role`)
 * because assistant entries may carry extra reasoning fields this client
 * ignores, and mapping code must not crash on a missing field. */
export interface HistoryMessage {
  role: string
  text?: string
  name?: string
  context?: string
}

export interface SessionHistoryParams {
  session_id: string
}

export interface SessionHistoryResult {
  count: number
  messages: HistoryMessage[]
}

/** `reload.mcp` (task 1.20): forces hermes to disconnect and reconnect every
 * configured MCP server against the CURRENT config.yaml. Needed because
 * hermes's MCP layer caches a connected server by name for the life of the
 * `hermes serve` process (tools/mcp_tool.py's `_servers` dict) and does NOT
 * reconnect it just because config.yaml changed underneath it — confirmed
 * live (task 1.20's verify notes): without this call after re-registering
 * aec-sources against a newly opened project, a session created afterwards
 * still sees the PREVIOUS project's sources. `confirm: true` bypasses the
 * interactive "/reload-mcp invalidates the prompt cache" warning gate — there
 * is no live transcript to warn on this project-switch path. */
export interface ReloadMcpParams {
  confirm?: boolean
  session_id?: string
}

export interface ReloadMcpResult {
  status: 'reloaded' | 'confirm_required'
  message?: string
}

export interface SessionResumeParams {
  session_id: string
}

/** The `session_id` returned here is a NEW live sid — NOT the one passed in
 * `params.session_id` — the gateway may reuse a live session under a
 * different id. Callers must adopt `result.session_id` as the active sid. */
export interface SessionResumeResult {
  session_id: string
  resumed: string
  message_count: number
  messages: HistoryMessage[]
  info: unknown
  inflight: unknown
  running: boolean
  session_key: unknown
  started_at: number
  status: 'streaming' | 'idle'
}

/** Maps each supported RPC method name to its params/result shape. */
export interface GatewayMethodMap {
  'session.create': { params: SessionCreateParams; result: SessionCreateResult }
  'prompt.submit': { params: PromptSubmitParams; result: PromptSubmitResult }
  'session.close': { params: SessionCloseParams; result: SessionCloseResult }
  'approval.respond': { params: ApprovalRespondParams; result: ApprovalRespondResult }
  'clarify.respond': { params: ClarifyRespondParams; result: InteractiveRespondResult }
  'secret.respond': { params: SecretRespondParams; result: InteractiveRespondResult }
  'sudo.respond': { params: SudoDeclineParams; result: InteractiveRespondResult }
  'session.list': { params: SessionListParams; result: SessionListResult }
  'session.history': { params: SessionHistoryParams; result: SessionHistoryResult }
  'session.resume': { params: SessionResumeParams; result: SessionResumeResult }
  'reload.mcp': { params: ReloadMcpParams; result: ReloadMcpResult }
}

/** Answer to a `clarify.request` (task 1.5.D1). `request_id` must echo the
 * one from the event — the gateway keys its pending map by it and replies
 * with error 4009 when it no longer matches anything. */
export interface ClarifyRespondParams {
  request_id: string
  answer: string
}

/** Answer to a `secret.request` (task 1.5.D1). `value` is the secret itself —
 * it exists only in transit: never logged, never stored in chat state, never
 * written to the transcript (specs/agent-chat.md §Security). An empty string
 * is the documented "skip" answer. */
export interface SecretRespondParams {
  request_id: string
  value: string
}

/** Answer to a `sudo.request` (task 1.5.D1). `password` is ALWAYS the empty
 * string here: the product decision is that this app never collects an OS
 * password — it declines the elevation and lets the agent proceed. The field
 * exists only because the gateway's `_respond` reads that key. */
export interface SudoDeclineParams {
  request_id: string
  password: ''
}

/** Shared shape of the gateway's `*.respond` acknowledgements. */
export interface InteractiveRespondResult {
  status: string
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

/** A chunk of the model's reasoning trace (task 1.5.D1). Distinct from
 * `thinking.delta` only in origin — hermes 0.18.0 wires them to two separate
 * agent callbacks (`thinking_callback` / `reasoning_callback`, server.py
 * `_agent_cbs`) — so the chat treats both as the same reasoning stream.
 * Unlike `tool.*`, these are NOT suppressed by `display.tool_progress: off`. */
export interface ReasoningDeltaEvent {
  type: 'reasoning.delta'
  session_id?: string
  payload: { text: string; verbose?: boolean }
}

/** A complete reasoning block delivered at once rather than streamed (task
 * 1.5.D1) — relayed through the gateway's tool-progress channel, so unlike
 * `reasoning.delta` this one IS suppressed when `display.tool_progress` is
 * `off` (server.py `_on_tool_progress`). */
export interface ReasoningAvailableEvent {
  type: 'reasoning.available'
  session_id?: string
  payload: { text: string; verbose?: boolean }
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

/** A tool invocation has begun. `context` is a human-readable one-liner
 * describing what the tool is doing (e.g. "Searching files for *.md"). */
export interface ToolStartEvent {
  type: 'tool.start'
  session_id?: string
  payload: { tool_id: string; name: string; context: string }
}

/** Same shape and handling as `tool.start` — the gateway protocol defines
 * both names; treat identically (upsert by tool_id, no duplication). */
export interface ToolStartedEvent {
  type: 'tool.started'
  session_id?: string
  payload: { tool_id: string; name: string; context: string }
}

/** An in-progress status update for a running tool call. Only known to be
 * carried in gateway source, not captured live — payload may or may not
 * include an updated context/text string. */
export interface ToolGeneratingEvent {
  type: 'tool.generating'
  session_id?: string
  payload?: { tool_id: string; text?: string; context?: string }
}

/** A tool invocation has finished. `result` is EITHER a JSON string OR an
 * object — both observed live from tui_gateway 0.18.0; long results can be
 * tens of KB. */
export interface ToolCompleteEvent {
  type: 'tool.complete'
  session_id?: string
  payload: {
    tool_id: string
    name: string
    args: object
    duration_s: number
    result: string | object
  }
}

/** The agent is requesting permission for a gated action (e.g. a shell
 * command). `command` is already redacted for display by the gateway.
 * Approvals form a FIFO queue per session — there is no request id; a
 * response resolves the oldest pending one (or all, with `all: true`).
 * `allow_permanent` gates whether the UI may offer the 'always' choice. */
export interface ApprovalRequestEvent {
  type: 'approval.request'
  session_id?: string
  payload: {
    command: string
    description: string
    pattern_keys: string[]
    allow_permanent: boolean
  }
}

// --- Blocking interactive requests (task 1.5.D1) ---------------------------
// The gateway raises these through `_block(...)`: the agent core STOPS until
// answered or until the timeout expires (clarify/secret 300 s, sudo 120 s —
// server.py `_block`). Leaving one unhandled is not cosmetic; it stalls the
// agent and reads as a freeze. Each carries a `request_id` that the matching
// `*.respond` must echo back.

/** The agent needs the user to disambiguate before it can continue. */
export interface ClarifyRequestEvent {
  type: 'clarify.request'
  session_id?: string
  payload: { request_id: string; question?: string; choices?: string[] }
}

/** A tool needs a secret (API token) it could not find. `prompt` explains
 * what is being asked for, `env_var` names where hermes will store it.
 * Answering with an empty value is a legitimate "skip" (server.py
 * `secret_cb`). The VALUE itself is never modelled here — see
 * specs/agent-chat.md §Security. */
export interface SecretRequestEvent {
  type: 'secret.request'
  session_id?: string
  payload: { request_id: string; prompt?: string; env_var?: string; metadata?: unknown }
}

/** A tool needs an elevation password. Unlikely on Windows, but an
 * unhandled request still stalls the agent for 120 s. */
export interface SudoRequestEvent {
  type: 'sudo.request'
  session_id?: string
  payload: { request_id: string }
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
  | ReasoningDeltaEvent
  | ReasoningAvailableEvent
  | StatusUpdateEvent
  | MessageCompleteEvent
  | GatewayErrorEvent
  | ToolStartEvent
  | ToolStartedEvent
  | ToolGeneratingEvent
  | ToolCompleteEvent
  | ApprovalRequestEvent
  | ClarifyRequestEvent
  | SecretRequestEvent
  | SudoRequestEvent
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
