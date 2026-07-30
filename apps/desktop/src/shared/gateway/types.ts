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
  'complete.slash': { params: CompleteSlashParams; result: CompleteSlashResult }
  'model.options': { params: ModelOptionsParams; result: ModelOptionsResult }
  'config.set': { params: ConfigSetParams; result: ConfigSetResult }
  'command.dispatch': { params: CommandDispatchParams; result: CommandDispatchResult }
  'complete.path': { params: CompletePathParams; result: CompleteSlashResult }
  'clipboard.paste': { params: AttachSessionParams; result: AttachResult }
  'image.attach': { params: AttachPathParams; result: AttachResult }
  'pdf.attach': { params: AttachPathParams; result: AttachResult }
  'image.detach': { params: AttachPathParams; result: DetachResult }
}

/** Attachments (task 1.6.A4).
 *
 * The attachment list lives in the GATEWAY's session (`attached_images`), not
 * here: `prompt.submit` folds it into the next message and clears it. So this
 * app mirrors their count, it does not own it — which is why every call below
 * returns `count` and the UI trusts that over anything it tracked itself.
 *
 * A PDF is not attached as a PDF: their handler renders each page to PNG via
 * `pdftoppm` and queues the pages as images (50 MB / 25 pages per call). One
 * chosen file therefore becomes many attachments. */
export interface AttachSessionParams {
  session_id: string
}

export interface AttachPathParams {
  session_id: string
  path: string
}

export interface AttachResult {
  attached: boolean
  path?: string
  count?: number
  /** Present on a refusal their side reports as success — `clipboard.paste`
   * answers `{attached: false, message}` when there is no image, rather than
   * raising. */
  message?: string
  /** `image.attach` suggests this as the message text when the user dropped a
   * path with no words around it. */
  text?: string
}

export interface DetachResult {
  detached: boolean
  count: number
}

/** `complete.path` (task 1.6.A3) — completions for an `@`-reference being
 * typed. Same item shape as `complete.slash`.
 *
 * Contract read off their handler: `word` is the whole token including the
 * leading `@`; a bare `@` returns their six static hints (`@diff`, `@staged`,
 * `@file:`, `@folder:`, `@url:`, `@git:`); a bare name with no `/` and at
 * least two characters is fuzzy-matched against repo basenames; anything
 * path-ish lists a directory. The list is capped at 30 either way.
 *
 * The chosen text goes into the message as-is. Expanding it into file contents
 * is THEIR job and already happens on our path: `_run_prompt_submit` runs
 * `preprocess_context_references` before the agent sees the text. This app
 * must therefore not read the file itself — doing so would duplicate their
 * expansion and, more importantly, bypass the redaction they do there. */
export interface CompletePathParams {
  word: string
  session_id?: string
}

/** `command.dispatch` (task 1.6.A5) — runs one slash command by name. We use
 * it for `goal` only.
 *
 * Why this and not `slash.exec`: their `slash.exec` recognises `goal` as a
 * `_PENDING_INPUT_COMMANDS` entry and forwards it straight here, because the
 * slash worker subprocess has no reader for the queue those commands write to.
 * Calling the destination directly removes a hop that exists only for their
 * TUI's benefit. */
export interface CommandDispatchParams {
  name: string
  arg: string
  session_id?: string
}

/** Two shapes, discriminated by `type`: `exec` is output to display, `send` is
 * a prompt their side wants submitted as a user turn (with `notice` shown
 * first). `/goal <text>` returns `send` — setting a goal immediately kicks it
 * off — while status/pause/resume/clear return `exec`. */
export interface CommandDispatchResult {
  type: 'exec' | 'send'
  output?: string
  notice?: string
  message?: string
}

/** `model.options` (task 1.6.9) — the provider/model catalogue behind the
 * composer's picker. Contract read off `tui_gateway/server.py`: the handler
 * layers the live agent's provider/model on top of disk config, and asks for
 * `include_unconfigured` + `picker_hints` + `capabilities`, so the answer
 * lists providers the user has NOT set up yet (with `authenticated: false`)
 * alongside configured ones.
 *
 * `refresh` busts their per-provider model-id disk cache AND lets saved custom
 * endpoints run live discovery. Their own comment says to leave it false on a
 * normal picker open, because a slow or offline local endpoint would otherwise
 * block the dialog — so it is wired only to an explicit "обновить список". */
export interface ModelOptionsParams {
  session_id?: string
  refresh?: boolean
}

/** Per-model gate for the picker's own controls: offering a "fast" toggle on a
 * model whose backend rejects it would produce an error the user never asked
 * for, so the control is hidden instead. */
export interface ModelCapabilities {
  fast?: boolean
  reasoning?: boolean
}

export interface ModelOptionProvider {
  slug: string
  name: string
  models?: string[]
  is_current?: boolean
  /** False for providers surfaced only so the picker can show the whole
   * universe — the user has no usable credentials for them yet. */
  authenticated?: boolean
  /** How an unconfigured provider would be activated. Only `api_key` can be
   * done inline; everything else needs their CLI/OAuth flow, which is out of
   * this app's scope. */
  auth_type?: string
  /** Env var an `api_key` provider's key would go into — shown as the reason
   * its models are not selectable, never collected by this app. */
  key_env?: string
  warning?: string
  capabilities?: Record<string, ModelCapabilities>
  /** Models the current account may not select (their free-tier gating). */
  unavailable_models?: string[]
}

export interface ModelOptionsResult {
  model?: string
  provider?: string
  providers?: ModelOptionProvider[]
}

/** `config.set` (task 1.6.9) — one setter keyed by `key`. We use exactly three
 * of its keys and no others; the rest belong to screens outside this task.
 *
 * Scope, read off their handler and worth stating because it is not obvious:
 * `model` and `reasoning` are applied to the LIVE session (their comment says
 * writing config.yaml here would let every picker click rewrite the user's
 * global default), while `fast` also writes `agent.service_tier` globally. */
export type ConfigSetKey = 'model' | 'reasoning' | 'fast'

export interface ConfigSetParams {
  key: ConfigSetKey
  value: string
  session_id?: string
  /** Only meaningful for `key: 'model'`: re-sends a switch their side asked to
   * confirm because the model is expensive. */
  confirm_expensive_model?: boolean
}

export interface ConfigSetResult {
  key: string
  value: string
  /** Non-fatal note about the switch that happened anyway. */
  warning?: string
  /** Their side refused to switch until the user confirms the cost; re-send
   * with `confirm_expensive_model: true`. */
  confirm_required?: boolean
  confirm_message?: string
}

/** `complete.slash` (task 1.6.8) — the gateway's own completion list for a
 * slash command being typed. Contract read off `tui_gateway/server.py`: it
 * returns an empty list unless `text` starts with "/", and caps the list at 30
 * entries. `display` and `meta` arrive already flattened to plain strings on
 * their side. */
export interface CompleteSlashParams {
  text: string
}

export interface SlashCompletionItem {
  /** What to put in the composer when this row is chosen. */
  text: string
  /** What to show in the row — usually the same as `text`. */
  display: string
  /** One-line description shown next to it; may be empty. */
  meta: string
}

export interface CompleteSlashResult {
  items: SlashCompletionItem[]
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

/** A delegated child agent's activity, relayed on the PARENT session (task
 * 1.6.A1). Contract read off `tui_gateway/server.py`'s `subagent.*` branch:
 * every event of the family carries `goal`/`task_count`/`task_index`, and the
 * identity fields are all optional — an older emitter that omits them is meant
 * to render flat rather than as a tree.
 *
 * NOTE, measured in the source rather than assumed: `subagent.text` (the
 * child's reply tokens) is deliberately NOT emitted on the parent session —
 * `if event_type != "subagent.text": _emit(...)`. It only reaches a window
 * opened on the child's own session. So the parent transcript sees five
 * events, not the six the family suggests. */
export interface SubagentEvent {
  type:
    | 'subagent.start'
    | 'subagent.thinking'
    | 'subagent.tool'
    | 'subagent.complete'
    | 'subagent.interrupt'
  session_id?: string
  payload: {
    goal: string
    task_count: number
    task_index: number
    subagent_id?: string
    parent_id?: string
    child_session_id?: string
    depth?: number
    model?: string
    tool_count?: number
    toolsets?: string[]
    /** Preview text: the child's thinking, or a tool preview. */
    text?: string
    tool_name?: string
    status?: string
    summary?: string
    duration_seconds?: number
    input_tokens?: number
    output_tokens?: number
  }
}

/** One model consulted by a Mixture-of-Agents turn (task 1.6.A2). */
export interface MoaReferenceEvent {
  type: 'moa.reference'
  session_id?: string
  payload: { model?: string; index?: number; count?: number }
}

/** The aggregator has started merging the consulted models' answers. */
export interface MoaAggregatingEvent {
  type: 'moa.aggregating'
  session_id?: string
  payload: { aggregator: string }
}

/** What the agent is running with, emitted whenever their side changes it
 * (task 1.6.9). Every field is optional because the payload is assembled from
 * live agent attributes that may not exist yet on a session whose agent is
 * still being built.
 *
 * `reasoning_effort` has three meaningful states, not two: a level name,
 * `'none'` (thinking explicitly off) and `''` (provider default). Their own
 * comment records that reporting `''` for "off" once made their desktop wipe
 * the user's sticky choice, so the distinction is load-bearing. */
export interface SessionInfoEvent {
  type: 'session.info'
  session_id?: string
  payload?: {
    model?: string
    provider?: string
    reasoning_effort?: string
    service_tier?: string
    fast?: boolean
    yolo?: boolean
  }
}

export type GatewayEvent =
  | GatewayReadyEvent
  | SessionInfoEvent
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
  | SubagentEvent
  | MoaReferenceEvent
  | MoaAggregatingEvent
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
