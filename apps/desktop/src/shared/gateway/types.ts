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
  /** Необязательная нагрузка JSON-RPC-отказа. Ядро её присылает (например при
   * 4018 — `data=_stale_target_data()` в `tui_gateway/methods_prompt.py`), и
   * код донора её читает, поэтому она обязана доехать до рендерера целиком, а
   * не свернуться в текст сообщения (находка D-37). */
  data?: unknown
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
    /** Порядковый номер кадра в кольце шлюза (появился в ядре 0.20.6).
     *
     * По нему после обрыва связи запрашивается догон: `session.events.since`
     * отдаёт всё, что старше последнего увиденного номера. Необязателен —
     * ядро без переигровки его не шлёт, и тогда догон просто не работает. */
    seq?: number
  }
}

/** A request the GATEWAY sends to this client (hermes 0.21.3,
 * `tui_gateway/server_requests.py`, task 3.B5в): the agent is blocked on a
 * question — clarify, approval, secret, sudo, a terminal or preview read, an
 * MCP-setup consent, a tour step. The id is a STRING (`srq-<12 hex>`) so it
 * can never collide with the integer ids this client mints; the answer is a
 * response frame carrying that same id (`GatewayServerResponseFrame`). The
 * old `<kind>.request` event + `<kind>.respond` method pairs are gone. */
export interface GatewayServerRequestFrame<M extends string = string> {
  jsonrpc?: '2.0'
  id: string
  method: M
  params: GatewayServerRequestParams
}

/** Parameters of a server→client request. `session_id` names the session
 * blocked on the answer; everything else is method-specific and reaches the
 * renderer untouched. */
export interface GatewayServerRequestParams extends Record<string, unknown> {
  session_id?: string
}

/** One server→client request as this client hands it to a listener. Answered
 * with `GatewayClient.respondToServerRequest`. `replayed` marks a request that
 * came back through `open_requests` after a reconnect rather than live. */
export interface GatewayServerRequest {
  id: string
  method: string
  params: GatewayServerRequestParams
  replayed: boolean
}

/** What a window answers a server→client request with — the frame minus
 * the id, which the transport adds. */
export type GatewayServerResponse =
  { result: Record<string, unknown> } | { error: { code: number; message: string } }

/** The answer to a server→client request. Exactly one of `result` / `error`;
 * the gateway drops an answer whose id is no longer open. */
export type GatewayServerResponseFrame =
  | { jsonrpc: '2.0'; id: string; result: Record<string, unknown> }
  | { jsonrpc: '2.0'; id: string; error: { code: number; message: string } }

/** Any frame the gateway can send over the WebSocket. */
export type GatewayIncomingFrame =
  GatewayResultFrame | GatewayErrorFrame | GatewayEventFrame | GatewayServerRequestFrame

// ---------------------------------------------------------------------------
// RPC methods: params / result pairs
// ---------------------------------------------------------------------------

export interface SessionCreateParams {
  source: string
  cwd?: string
  model?: string
  /** Build this session against another local profile's home/state.db (task
   * 1.6.B5.23). Omitted means the profile the gateway was launched with —
   * their `_profile_home(None)` — which is the only behaviour before batch 5. */
  profile?: string
  /** Сессия рождается скрытой: в общем списке её нет, но она полностью
   * доступна тому, кто ей владеет (задача 3C.4). Так заводятся постоянные чаты
   * специалистов — иначе общий список сессий превращается в свалку. */
  hidden?: boolean
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

/** A LIVE session id: the ephemeral handle for a session that this gateway
 * process currently holds in memory (`_sessions`). Every streaming RPC —
 * `prompt.submit`, `session.usage`, `session.title`, `session.steer` — takes
 * THIS one, and it changes on every resume.
 *
 * Purely documentary (both aliases are `string`): TypeScript cannot stop a
 * mix-up, but naming the two makes a wrong call visible at the call site
 * instead of at runtime, where the gateway answers 4007 "session not found"
 * for a stored id passed where a live one belongs. */
export type LiveSessionId = string

/** A STORED session id (their `session_key`): the row in `state.db` that
 * `session.list` enumerates, `session.resume`/`session.delete` address, and
 * this app tags against a project vault (`main/session-projects.ts`).
 * Survives restarts; a live sid does not. */
export type StoredSessionId = string

export interface PromptSubmitParams {
  session_id: LiveSessionId
  text: string
  /** Re-run from an edited user message (task 1.6.B5.27, hermes 0.19.0):
   * truncate the history right before the N-th USER message — the ordinal
   * counts user turns only, not transcript entries — then submit `text` as the
   * new N-th turn. Their handler also rewrites the DB (`db.replace_messages`),
   * so this is not a display-only trim.
   *
   * They reject an out-of-range ordinal on BOTH ends with 4018, negative
   * included, and their own comment says why: Python's negative indexing would
   * otherwise resolve `-1` to the LAST user turn and silently truncate the
   * whole session to it. */
  truncate_before_user_ordinal?: number
}

/** Three outcomes since hermes 0.19.0, where one used to be enough.
 *
 * Up to 0.18.0 a prompt sent mid-turn was REJECTED ("session busy") and every
 * client had to queue it itself — which is what this app's composer does
 * (task 1.6.8). 0.19.0 replaced the rejection with a policy driven by their
 * `display.busy_input_mode` key (the same one the settings screen writes,
 * task 1.6.B2.13):
 * - `interrupt` (their default) — queue it AND wind the live turn down
 * - `queue` — queue it, let the turn finish
 * - `steer` — inject it into the running turn if the agent accepts, else queue
 *
 * So `queued` and `steered` are SUCCESS, not failure, and a caller that treats
 * anything but `streaming` as an error would report a message that was
 * accepted as one that was lost. */
export interface PromptSubmitResult {
  status: 'streaming' | 'queued' | 'steered'
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
  /** A STORED id — this list reads the database, not live sessions. MEASURED
   * (probe 1.6.B5.1): the row has exactly six fields and `cwd` is NOT among
   * them, which is why sessions are scoped to a project by this app's own
   * tagging (`main/session-projects.ts`) and not by the gateway. */
  id: StoredSessionId
  title: string
  preview: string
  started_at: number
  message_count: number
  source: string
}

/** Догон событий после обрыва связи (ядро 0.20.6, задача 3.B2г). */
export interface SessionEventsSinceParams {
  session_id: string
  /** Последний номер кадра, который клиент точно видел. */
  last_seen: number
}

export interface SessionEventsSinceResult {
  /** Пропущенные кадры в том же порядке, в каком они шли живьём. */
  events: GatewayEventFrame[]
  /** Самый свежий номер в кольце — на него сдвигается отметка клиента. */
  latest_seq: number
  /** Кольцо проехало запрошенную точку: часть кадров потеряна безвозвратно, и
   * честный ответ на это — перечитать историю, а не делать вид, что догнали. */
  truncated: boolean
  count: number
  /** Метка запуска шлюза. Счётчики живут в процессе, поэтому после его
   * перезапуска старая отметка клиента не значит ничего — несовпадение с
   * меткой из `gateway.ready` означает «считать заново». */
  epoch: string
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
  session_id: StoredSessionId
  /** Resume a session that lives in another profile's `state.db` (task
   * 1.6.B5.23) — same meaning as on `session.create`. */
  profile?: string
}

/** The `session_id` returned here is a NEW live sid — NOT the one passed in
 * `params.session_id` — the gateway may reuse a live session under a
 * different id. Callers must adopt `result.session_id` as the active sid. */
export interface SessionResumeResult {
  session_id: LiveSessionId
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
  'session.list': { params: SessionListParams; result: SessionListResult }
  'session.history': { params: SessionHistoryParams; result: SessionHistoryResult }
  'session.resume': { params: SessionResumeParams; result: SessionResumeResult }
  'session.events.since': { params: SessionEventsSinceParams; result: SessionEventsSinceResult }
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
  'rollback.list': { params: RollbackListParams; result: RollbackListResult }
  'rollback.diff': { params: RollbackDiffParams; result: RollbackDiffResult }
  'rollback.restore': { params: RollbackRestoreParams; result: RollbackRestoreResult }
  'config.get': { params: ConfigGetParams; result: ConfigGetResult }
  'config.show': { params: ConfigShowParams; result: ConfigShowResult }
  'tools.list': { params: ToolsListParams; result: ToolsListResult }
  'tools.configure': { params: ToolsConfigureParams; result: ToolsConfigureResult }
  'plugins.manage': { params: PluginsManageParams; result: PluginsManageResult }
  'process.list': { params: ProcessListParams; result: ProcessListResult }
  'process.kill': { params: ProcessKillParams; result: ProcessKillResult }
  'agents.list': { params: AgentsListParams; result: AgentsListResult }
  'setup.runtime_check': { params: RuntimeCheckParams; result: RuntimeCheckResult }
  'skills.manage': { params: SkillsManageParams; result: SkillsManageResult }
  'skills.reload': { params: SkillsReloadParams; result: SkillsReloadResult }
  'learning.detail': { params: LearningNodeParams; result: LearningDetailResult }
  'learning.edit': { params: LearningEditParams; result: LearningMutationResult }
  'learning.delete': { params: LearningNodeParams; result: LearningMutationResult }
  'session.delete': { params: SessionDeleteParams; result: SessionDeleteResult }
  'session.title': { params: SessionTitleParams; result: SessionTitleResult }
  'session.active_list': { params: SessionActiveListParams; result: SessionActiveListResult }
  'session.activate': { params: SessionActivateParams; result: LiveSessionPayload }
  'session.branch': { params: SessionBranchParams; result: SessionBranchResult }
  'session.usage': { params: SessionScopedParams; result: SessionUsageResult }
  'session.context_breakdown': { params: SessionScopedParams; result: ContextBreakdownResult }
  'session.compress': { params: SessionCompressParams; result: SessionCompressResult }
  'session.undo': { params: SessionScopedParams; result: SessionUndoResult }
  'session.steer': { params: SessionSteerParams; result: SessionSteerResult }
  'commands.catalog': { params: CommandsCatalogParams; result: CommandsCatalogResult }
  // Роестр специалистов (задача 3C.1, SPEC UR27, контракт — specs/agent-roster.md).
  // Формы намеренно широкие: ряд профиля несёт свободный блок `ui_meta`, куда
  // каждый клиент кладёт своё, и описывать чужие поля типом мы не вправе.
  // Разбирает ответ `roster-pure.ts` — там же и проверки.
  //
  // `profiles.delete` в этом списке НЕТ, и это не пропуск: такого метода у ядра
  // 0.20.4 нет вовсе (замерено в реестре шлюза), удаление идёт по REST.
  'profiles.list': { params: ProfilesListParams; result: unknown }
  'profiles.create': { params: { name: string }; result: unknown }
  'profiles.configure': { params: ProfilesConfigureParams; result: unknown }
  'profiles.set_asset': { params: ProfilesSetAssetParams; result: unknown }
  'profiles.get_asset': { params: { name: string; asset?: string }; result: unknown }
}

export interface ProfilesListParams {
  include_sessions?: boolean
  /** Привязки постоянных чатов: ядро вернёт по ним сводку сессии или `null`,
   * если она пропала (задача 3C.4). */
  preferred_session_ids?: Record<string, string>
}

export interface ProfilesConfigureParams {
  name: string
  description?: string
  ui_meta?: Record<string, unknown>
}

export interface ProfilesSetAssetParams {
  name: string
  asset?: 'avatar'
  /** `data:`-адрес картинки. Ядро принимает PNG/JPEG/WebP и режет по 2 МБ. */
  data?: string
  /** Убрать картинку. */
  clear?: boolean
}

// `process.stop` is DELIBERATELY absent from the map above (owner decision R8,
// task 1.6.B6.3). It is not a bulk version of `process.kill` scoped to this
// window: their handler calls the registry's `kill_all()`, which reaps the
// background processes of EVERY session of the gateway — another window's
// build included. Nothing in this app may be one typo away from that, so the
// method has no type, and `stopAllProcesses` has no IPC channel either.
// `chat-state.test.ts` pins this: the name must not appear in the map.

// ---------------------------------------------------------------------------
// Sessions, details and the command palette (batch 5, contract:
// specs/agent-sessions.md). Every shape below was read off the installed
// gateway's `tui_gateway/server.py`; the ones marked MEASURED were confirmed by
// `runtime/sessions-probe.mjs` (task 1.6.B5.1).
//
// `session.archive` and any search parameter are DELIBERATELY ABSENT: neither
// exists in the gateway at all (owner decision B5-2 on the first, measured
// absence on the second — `session.list` takes `limit` and nothing else). The
// screen filters the list it already has and says so.
// ---------------------------------------------------------------------------

/** Most session methods take nothing but the live sid. */
export interface SessionScopedParams {
  session_id: LiveSessionId
}

/** `session.delete` — irreversible: it drops the DB row AND the on-disk
 * transcript files.
 *
 * Errors: 4023 (the session is live in this gateway process — refused by
 * `session_key` across ALL sessions, not just ours), 4007 (no such row), 5036. */
export interface SessionDeleteParams {
  session_id: StoredSessionId
}

export interface SessionDeleteResult {
  deleted: string
}

/** `session.title` — read (omit `title`) or set the session's name.
 *
 * Takes a LIVE sid: their handler resolves the session through `_sess_nowait`,
 * so a session that is only a row in the DB cannot be renamed until it is
 * resumed. That is why the rename path in this app is resume-then-title.
 *
 * Errors: 4021 (empty title), 4022, 5007. */
export interface SessionTitleParams {
  session_id: LiveSessionId
  title?: string
}

/** `pending: true` means the DB row does not exist yet (their write is deferred
 * to the first prompt) and the name will be applied then — a success, not a
 * failure. */
export interface SessionTitleResult {
  title: string
  pending?: boolean
  session_key?: StoredSessionId
}

/** `session.active_list` — live sessions of THIS gateway process, which is a
 * different question from `session.list`'s "what is in the database".
 *
 * MEASURED (probe 1.6.B5.1): rows carry `current`, `id`, `last_active`,
 * `message_count`, `model`, `preview`, `session_key`, `started_at`, `status`,
 * `title` — four of which `session.list` does not have. This is the only source
 * for "which session is the current one" and for a live session's `session_key`
 * (needed after `session.branch`, which does not return it).
 *
 * Errors: 5036. */
export interface SessionActiveListParams {
  current_session_id?: LiveSessionId
}

export interface LiveSessionSummary {
  /** The LIVE sid — pass it to `session.activate`, not to `session.resume`. */
  id: LiveSessionId
  /** The stored id — pass THIS one to `session.delete`, and tag it against a
   * project. */
  session_key: StoredSessionId
  title: string
  preview: string
  model: string
  status: string
  current: boolean
  message_count: number
  started_at: number
  last_active: number
}

export interface SessionActiveListResult {
  sessions: LiveSessionSummary[]
}

/** `session.activate` — attach to an already-live session. Deliberately does
 * NOT close the previously focused one (their comment says so), which is what
 * makes parallel sessions parallel.
 *
 * Errors: 4007. */
export interface SessionActivateParams {
  session_id: LiveSessionId
}

/** Shared answer of `session.activate` (their `_live_session_payload`).
 * `messages` is in the same shape `session.resume` returns — unlike
 * `session.compress`, see `SessionCompressResult`. */
export interface LiveSessionPayload {
  session_id: LiveSessionId
  session_key: StoredSessionId
  messages: HistoryMessage[]
  message_count: number
  running: boolean
  started_at: number
  status: string
  info?: unknown
  inflight?: unknown
  queued?: unknown
}

/** `session.branch` — fork the current conversation into a new session that
 * starts with a copy of its history.
 *
 * Errors: 4008 ("nothing to branch — send a message first", MEASURED on an
 * empty session), 4090 (session limit), 5008, 5000. */
export interface SessionBranchParams {
  session_id: LiveSessionId
  name?: string
}

/** The new session's STORED id is not here — `session_id` is its live sid and
 * `parent` is the PARENT's stored key. To tag the branch against a project this
 * app reads its `session_key` back from `session.active_list`. */
export interface SessionBranchResult {
  session_id: LiveSessionId
  title: string
  parent: StoredSessionId
}

/** `session.usage` — cumulative token spend of this session.
 *
 * `context_used`/`context_max`/`context_percent` are OMITTED when the core does
 * not know the current window occupancy (their comment: "leave it unknown
 * otherwise" — they deliberately do not fabricate a 0). A UI that renders a
 * missing field as 0 % would invent a reading. */
export interface SessionUsageResult {
  model?: string
  input?: number
  output?: number
  reasoning?: number
  prompt?: number
  completion?: number
  total?: number
  calls?: number
  context_used?: number
  context_max?: number
  context_percent?: number
  compressions?: number
  active_subagents?: number
  /** Pre-rendered Nous credit lines; absent unless logged into their portal. */
  credits_lines?: string[]
}

/** `session.context_breakdown` — what is filling the context window.
 *
 * `color` is one of THEIR CSS variables (`var(--ui-text-tertiary)` and friends,
 * `agent/context_breakdown.py`). It is typed here so its presence is not a
 * surprise, and never used: our palette is our own.
 *
 * An empty `categories` is the "no agent built yet" answer, not an error. */
export interface ContextBreakdownCategory {
  id: string
  label: string
  tokens: number
  color?: string
}

export interface ContextBreakdownResult {
  categories: ContextBreakdownCategory[]
  context_used?: number
  context_max?: number
  context_percent?: number
  estimated_total?: number
  model?: string
}

/** `session.compress` — manual context compression.
 *
 * Errors: 4009 while a turn is running, 5005, 5019.
 *
 * THE TRAP: `messages` here is the agent's RAW history (`{role, content,
 * tool_calls}`), NOT the `{role, text, name, context}` shape `session.resume`
 * and `session.history` return — their handler copies `session["history"]`
 * without running `_history_to_messages` over it. Redrawing the transcript from
 * it produces empty bubbles, so this app re-reads `session.history` after a
 * successful compress and takes only the counters from here. */
export interface SessionCompressParams {
  session_id: LiveSessionId
  focus_topic?: string
}

export interface SessionCompressResult {
  status: string
  removed?: number
  before_messages?: number
  after_messages?: number
  before_tokens?: number
  after_tokens?: number
  summary?: unknown
  usage?: unknown
  info?: unknown
  /** Raw history — see the note above. Typed as `unknown[]` on purpose: it is
   * not `HistoryMessage[]`, and calling it that is how the bug gets written. */
  messages?: unknown[]
}

/** `session.undo` — drops the last turn from the gateway's IN-MEMORY history.
 *
 * `removed` counts transcript entries, tool results included: their loop pops
 * every trailing `assistant`/`tool` entry and then one `user`.
 *
 * The DB is NOT rewritten (no `replace_messages` call in the handler), so the
 * undone turn comes back on the next resume. Read in their code; the probe
 * could not confirm it live (an empty session has nothing to undo), so the UI
 * says so rather than promising a permanent removal.
 *
 * Errors: 4009 while a turn is running. */
export interface SessionUndoResult {
  removed: number
}

/** `session.steer` — inject a note into the RUNNING turn without interrupting
 * it; it lands on the next tool result.
 *
 * Errors: 4002 (empty text, MEASURED), 4010 (this agent has no `steer`), 5000. */
export interface SessionSteerParams {
  session_id: LiveSessionId
  text: string
}

/** `rejected` is a normal answer, not a failure: the agent declined the note
 * (usually because there is no tool boundary left to attach it to). */
export interface SessionSteerResult {
  status: 'queued' | 'rejected'
  text?: string
}

/** `commands.catalog` — the slash-command registry behind the command palette.
 *
 * Their handler builds it from `COMMAND_REGISTRY` plus the profile's
 * `quick_commands` and any skill commands, and reports a partial failure in
 * `warning` rather than raising — so an empty section with a filled `warning`
 * is a meaningful state and must not be swallowed.
 *
 * Errors: 5020. */
export type CommandsCatalogParams = Record<string, never>

export interface CommandCategory {
  name: string
  /** `[name, description]` pairs, in their order. */
  pairs: string[][]
}

export interface CommandsCatalogResult {
  pairs: string[][]
  categories: CommandCategory[]
  /** Lowercased alias → canonical `/name`. Includes every command's own name. */
  canon: Record<string, string>
  sub?: Record<string, string[]>
  skill_count?: number
  warning?: string
}

// ---------------------------------------------------------------------------
// Skills and learning (batch 3, contract: specs/agent-skills.md)
//
// `learning.frames` is DELIBERATELY ABSENT from the map above. It is the RPC
// this batch was planned around, and on hermes 0.18.0 it did not work on this
// platform at all: measured error 5000 "Invalid format string", because
// `agent/learning_graph_render.py:_period_label` called `strftime("%-d %b")`
// and `%-d` is a glibc extension Windows' CRT lacks. hermes 0.19.0 fixed that
// (measured: the method answers), and the screen still does not use it — `GET
// /api/learning/graph` carries the same graph without their ASCII renderer,
// which is what the task asked for anyway, and formats no dates, so nothing of
// ours rides on their date handling. See `LearningGraph` in shared/ipc.ts.
// ---------------------------------------------------------------------------

/** `skills.manage` — this app uses `list` only. The hub actions (`search`,
 * `browse`, `install`, `inspect`) exist and work (measured), but installing
 * third-party executable code with one click is deferred to Phase 4+ (owner
 * decision B3-3), so no caller for them exists here.
 *
 * Errors: 4017 (unknown action), 5024. */
export interface SkillsManageParams {
  action: 'list'
}

/** Category → skill names. That is the whole answer: no descriptions, no
 * enabled flag, no paths. `GET /api/skills` carries all three, which is why
 * the screen reads the list from there and keeps this for the reload path. */
export interface SkillsManageResult {
  skills: Record<string, string[]>
}

export type SkillsReloadParams = Record<string, never>

/** `skills.reload` re-scans the skill directories. `output` is their
 * pre-rendered terminal text; `result` is the structured half this app uses.
 *
 * Errors: 5025. */
export interface SkillsReloadResult {
  output?: string
  result?: {
    added?: { name?: string }[]
    removed?: { name?: string }[]
    total?: number
  }
}

/** A journey node id. Two shapes, and they behave differently everywhere:
 * a bare skill name, or `memory:<source>:<index>`
 * (`agent/learning_mutations.py`'s `parse_node_kind`). */
export interface LearningNodeParams {
  id: string
}

export interface LearningEditParams {
  id: string
  content: string
}

/** Their mutations never raise for a bad id — `agent/learning_mutations.py`
 * catches `ValueError`/`IndexError` and answers `{ok: false, message}` as a
 * SUCCESSFUL RPC result (measured on a missing skill and a missing memory
 * node). Every caller must read `ok`; the absence of an error means nothing. */
export interface LearningMutationResult {
  ok: boolean
  message?: string
}

export interface LearningDetailResult {
  ok: boolean
  message?: string
  kind?: 'skill' | 'memory'
  id?: string
  label?: string
  /** Full SKILL.md text, or the raw memory chunk. */
  content?: string
}

// ---------------------------------------------------------------------------
// Settings, tools, plugins and background processes (batch 2 / 2a, task
// 1.6.B2.2). Every shape below was read off the installed gateway's
// `tui_gateway/server.py`, not off their React code — the desktop donor uses
// their REST dashboard for most of this, and the two surfaces do not agree
// field for field.
//
// `process.stop` is DELIBERATELY ABSENT from the method map above: it is
// `kill_all()` across every session of the gateway process, and owner decision
// R8 of phase 1.6 is "no such button — one at a time, within our own session".
// Adding the type would be the first half of building the button.
// ---------------------------------------------------------------------------

/** The `config.get` keys this app reads. `full` is deliberately not among
 * them: it answers with the WHOLE config.yaml, api key included and
 * unmasked — the settings summary uses `config.show` instead, which masks it
 * server-side (see `ConfigShowResult`).
 *
 * Errors: unknown key → 4002. */
export type ConfigGetKey = 'reasoning' | 'fast' | 'busy' | 'prompt'

export interface ConfigGetParams {
  key: ConfigGetKey
  session_id?: string
}

/** One result type for every key, because the gateway keys its answer shape by
 * `key` rather than by method. Which field is populated:
 * - `reasoning` → `value` (effort name) + `display` ('show' | 'hide')
 * - `fast` → `value`: 'fast' | 'normal'
 * - `busy` → `value`: 'queue' | 'steer' | 'interrupt'
 * - `prompt` → `prompt` (the custom system prompt; '' when unset) */
export interface ConfigGetResult {
  value?: string
  display?: string
  prompt?: string
}

export type ConfigShowParams = Record<string, never>

/** Pre-rendered, pre-masked config summary — their handler builds the sections
 * and masks the API key as `****last4` itself. We render what it sends and add
 * nothing: any "helpful" enrichment here would mean fetching the raw config. */
export interface ConfigShowSection {
  title: string
  /** `[label, value]` pairs, in display order. */
  rows: string[][]
}

export interface ConfigShowResult {
  sections: ConfigShowSection[]
}

/** `tools.list` — toolsets with their resolved tool names. `enabled` is already
 * computed server-side against the live session's agent (or disk config when no
 * session is passed), including their `name in enabled if enabled else True`
 * rule: an EMPTY enabled-set means "everything is on", not "nothing is".
 *
 * Errors: 5031 (their toolset registry raised). */
export interface ToolsListParams {
  session_id?: string
}

export interface ToolsetInfo {
  name: string
  description: string
  tool_count: number
  enabled: boolean
  tools: string[]
}

export interface ToolsListResult {
  toolsets: ToolsetInfo[]
}

/** `tools.configure` — enable/disable whole toolsets (and, with a `server:tool`
 * name, individual MCP tools). Writes config.yaml AND, when `session_id` names
 * a live session, REBUILDS that session's agent.
 *
 * Errors: 4017 (unknown action), 4018 (empty `names`), 5035 (write failed). */
export interface ToolsConfigureParams {
  action: 'enable' | 'disable'
  names: string[]
  session_id?: string
}

/** Three different outcomes arrive in one payload and must not be collapsed:
 * `changed` is what actually took effect, `unknown` is names their registry
 * does not know, and `missing_servers` is MCP servers that are configured but
 * not currently connected. `reset: true` means the live agent was rebuilt. */
export interface ToolsConfigureResult {
  changed: string[]
  enabled_toolsets: string[]
  missing_servers: string[]
  unknown: string[]
  reset: boolean
  info?: unknown
}

/** `plugins.manage` — list or toggle. Measured, not assumed (probe
 * `runtime/plugins-probe.mjs`, task 1.6.B2a.1): `status` has THREE values —
 * `enabled`, `disabled` (turned off explicitly) and `not enabled` (never
 * touched) — so a screen that compares against two of them mislabels the
 * third.
 *
 * Errors: 4019 (toggle without `name`), 4017 (unknown action), 5026 (their
 * enable/disable primitive failed). */
export interface PluginsManageParams {
  action: 'list' | 'toggle'
  name?: string
  enable?: boolean
}

export interface PluginRow {
  name: string
  version: string
  description: string
  /** 'bundled' for plugins shipped with hermes; anything else is a user
   * plugin — i.e. third-party code that runs inside the gateway process. */
  source: string
  status: string
}

export interface PluginsManageResult {
  /** `action: 'list'` only. */
  plugins?: PluginRow[]
  user_count?: number
  bundled_count?: number
  /** `action: 'toggle'` only. `unchanged` means it was already in the
   * requested state — a success, but not a change. `plugin` is the refreshed
   * row and is the only thing the UI may believe about the new state. */
  ok?: boolean
  unchanged?: boolean
  name?: string
  plugin?: PluginRow | null
}

/** `process.list` — background processes owned by THIS session (their
 * `_session_processes` filters the registry by `session_key`). `output_tail`
 * is added by the gateway on top of the registry's 200-char
 * `output_preview` — up to 4000 characters.
 *
 * Errors: the usual session errors (4007 unknown session), 5010. */
export interface ProcessListParams {
  session_id: string
}

export interface ProcessEntry {
  /** The process id — confusingly named `session_id` by their registry; it is
   * NOT a chat session id. Pass it back as `process_id` to `process.kill`. */
  session_id: string
  command: string
  cwd?: string
  pid?: number
  started_at?: string
  uptime_seconds?: number
  status?: string
  output_preview?: string
  output_tail?: string
  exit_code?: number | null
  detached?: boolean
}

export interface ProcessListResult {
  processes: ProcessEntry[]
}

/** `process.kill` — one process, and only one owned by the calling session:
 * their handler compares `session_key` and answers 4044 otherwise, so a window
 * cannot reap another session's work.
 *
 * Errors, read off `methods_tools.py`, `@method("process.kill")` (task 1.6.B6.3): 4012 — `process_id`
 * missing or empty; 4044 — no such process, INCLUDING one that exists but
 * belongs to another session; 5010 — registry failure. Plus the usual session
 * errors (4007). */
export interface ProcessKillParams {
  session_id: string
  process_id: string
}

/** Not an error union: `not_found` / `already_exited` / `killed` all arrive as
 * a successful RPC result and mean different things to the user. */
export interface ProcessKillResult {
  status: string
  error?: string
  exit_code?: number | null
  session_id?: string
  completion_reason?: string
  termination_source?: string
}

/** `agents.list` — the same registry, unscoped: every session's processes,
 * with only four fields. Observation only; there is no cross-session kill on
 * our side (decision R8).
 *
 * Errors: 5033. */
export type AgentsListParams = Record<string, never>

export interface AgentProcessEntry {
  session_id: string
  /** Truncated to 80 characters by their handler (vs 200 in `process.list`). */
  command: string
  status: string
  uptime: number
}

export interface AgentsListResult {
  processes: AgentProcessEntry[]
}

/** `setup.runtime_check` — "would a prompt sent right now actually reach a
 * model?". Distinct from `setup.status`, which only asks whether ANY provider
 * looks configured. Never raises: a failure comes back as `ok: false` with a
 * human-readable `error`. */
export interface RuntimeCheckParams {
  provider?: string
}

export interface RuntimeCheckResult {
  ok: boolean
  provider?: string
  model?: string
  /** Where the credential came from (env var, keyring, IAM role, …). */
  source?: string
  error?: string
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

/** Five shapes, discriminated by `type` (all five read off their dispatcher):
 * - `exec` — a quick command's captured output, in `output`
 * - `plugin` — a plugin command's output, also in `output`
 * - `send` — a prompt their side wants submitted as a user turn, in `message`,
 *   with `notice` shown first (`/goal <text>`, `/learn`, skill bundles)
 * - `skill` — a skill invocation message, in `message`, with the skill's
 *   display `name`
 * - `alias` — the command is an alias; `target` names what to run instead
 *
 * `/goal <text>` returns `send` — setting a goal immediately kicks it off —
 * while status/pause/resume/clear return `exec`. A `type` outside these five is
 * not guessed at by any caller: it is reported and nothing is sent. */
export interface CommandDispatchResult {
  type: 'exec' | 'send' | 'plugin' | 'skill' | 'alias'
  output?: string
  notice?: string
  message?: string
  name?: string
  target?: string
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
  /** Include providers the user has NOT set up yet, each with
   * `authenticated: false` and the env var its key would go into.
   *
   * Load-bearing since hermes 0.19.0 and easy to miss: up to 0.18.0 their
   * handler forced this on and there was no parameter. 0.19.0 made it a
   * parameter defaulting to FALSE — measured on the upgrade, the same call
   * went from 41 providers to 3. Nothing errors when it is omitted; the
   * catalogue just silently shrinks to what is already configured. */
  include_unconfigured?: boolean
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

/** `config.set` (task 1.6.9) — one setter keyed by `key`.
 *
 * Scope, read off their handler and worth stating because it is not obvious:
 * `model` and `reasoning` are applied to the LIVE session (their comment says
 * writing config.yaml here would let every picker click rewrite the user's
 * global default), while `fast` also writes `agent.service_tier` globally.
 *
 * The first three are the composer's picker (task 1.6.9); `verbose`, `prompt`
 * and `busy` were added for the settings screen's "Поведение агента" (task
 * 1.6.B2.13). Each caller keeps its OWN allowlist in main — the composer must
 * not become a path to the system prompt, and the settings screen must not
 * become a path to keys this app deliberately does not expose (their TUI-only
 * display keys, decision R6).
 *
 * Values their handler accepts, per key:
 * - `reasoning`: an effort name, or `show`/`hide` to control whether the
 *   reasoning trace is displayed (two different settings behind one key)
 * - `fast`: `fast` | `normal` (also `on`/`off`/`toggle`/`status`)
 * - `verbose`: `off` | `new` | `all` | `verbose` — this is `display.tool_progress`,
 *   the same setting that decides whether tool cards appear at all
 * - `busy`: `queue` | `steer` | `interrupt`
 * - `prompt`: the custom system prompt; the literal `clear` removes it
 * - `yolo`: `1`/`0` (also `on`/`off`); ANY other value, empty string included,
 *   makes their handler INVERT the current state — so this app always sends an
 *   explicit `'1'`/`'0'` (task 1.6.B5.21) */
export type ConfigSetKey = 'model' | 'reasoning' | 'fast' | 'verbose' | 'prompt' | 'busy' | 'yolo'

export interface ConfigSetParams {
  key: ConfigSetKey
  value: string
  session_id?: LiveSessionId
  /** `yolo` only, and `'session'` ONLY — the type has no `'global'` member on
   * purpose (owner decision B5-5=A). Their global scope rewrites
   * `approvals.mode` in config.yaml to `off`/`manual`, which would bypass this
   * app's own approvals selector (task 0.17) and destroy its `smart` mode,
   * since their zap only knows two states. Omitting it also means a call
   * without a live session is impossible to write by accident — that path
   * flips `HERMES_YOLO_MODE` for the whole gateway process. */
  scope?: 'session'
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

/** Checkpoints and rollback (task 1.6.C2, contract:
 * specs/checkpoints-rollback.md).
 *
 * The one thing to know before reading the shapes below: none of the three
 * methods takes a directory. They all operate on the SESSION's cwd
 * (`_with_checkpoints`, tui_gateway/server.py), while hermes files each
 * snapshot under whatever directory `get_working_dir_for_path` picked for the
 * edited file — see `main/checkpoint-scope-pure.ts` for why that makes an
 * empty list ambiguous and how this app diagnoses it.
 *
 * The gateway also loses data the core has: `list_checkpoints` returns the
 * snapshot's reason as `reason` plus `short_hash`/`files_changed`/
 * `insertions`/`deletions`, but the handler copies `c.get("message", "")` and
 * drops the rest — so `message` is ALWAYS empty here and there is no change
 * count to show. Nothing in the UI may pretend otherwise. */
export interface RollbackListParams {
  session_id: string
}

export interface RollbackCheckpoint {
  /** Full 40-char hash — the id to pass back to diff/restore. */
  hash: string
  /** ISO 8601 with offset (git `%aI`). */
  timestamp: string
  /** Always the empty string on this path; see the note above. */
  message?: string
}

/** `enabled` is the core's `CheckpointManager.enabled` — under our integration
 * it comes from the `HERMES_TUI_CHECKPOINTS` env var, NOT `checkpoints.enabled`
 * in config.yaml (task 1.6.C1). When false the handler answers an empty list
 * without touching the store, so "off" and "nothing recorded" are only
 * distinguishable by this flag. */
export interface RollbackListResult {
  enabled: boolean
  checkpoints: RollbackCheckpoint[]
}

export interface RollbackDiffParams {
  session_id: string
  hash: string
}

/** Diff of the snapshot against the CURRENT working tree.
 *
 * Two server-side quirks the UI has to live with: `diff` is sliced to 4000
 * characters with no truncation marker, and a failed `mgr.diff()` (unknown or
 * pruned hash, no store yet) is NOT propagated — the handler reads the missing
 * `stat`/`diff` keys and answers two empty strings, indistinguishable from "no
 * changes". `rendered` is an ANSI rendering sized for their terminal; this app
 * ignores it. */
export interface RollbackDiffResult {
  stat: string
  diff: string
  rendered?: string
}

/** `file_path` must be relative to the working directory (their
 * `_validate_file_path` rejects absolute paths and `..` traversal). Omitting
 * it means a FULL restore, which also truncates the session history — and is
 * refused with JSON-RPC 4009 while a turn is running; a file-scoped restore is
 * allowed at any time. */
export interface RollbackRestoreParams {
  session_id: string
  hash: string
  file_path?: string
}

/** Unlike `rollback.diff`, this one passes the manager's result through whole,
 * so `success: false` + `error` is a normal, expected answer that arrives as a
 * successful RPC response. */
export interface RollbackRestoreResult {
  success: boolean
  error?: string
  /** Short (8-char) hash of the snapshot restored to. */
  restored_to?: string
  /** The snapshot's reason — the only path on which this app ever learns it. */
  reason?: string
  directory?: string
  file?: string
  /** Full restores only: how many trailing messages were dropped from the
   * session history so the agent's context matches the restored files. */
  history_removed?: number
}

/** What the answer to the agent's `terminal.read` request carries under
 * `value` (as a JSON STRING — their handler forwards it to the tool, which
 * parses it itself). Field names are
 * the donor's, kept pofamilno so their `read_terminal` tool can page with
 * `start`/`count` against `total_lines`.
 *
 * `viewport_rows` and `cursor_row` are honest derivations, not hardware
 * values: this app renders the buffer as text, not through xterm, so there is
 * no real viewport or cursor (specs/workbench-panels.md, fact 6). */
export interface TerminalReadPayload {
  total_lines: number
  start: number
  end: number
  viewport_rows: number
  cursor_row: number
  text: string
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

/** A one-line status from the core. `kind` is the whole contract and it has
 * more values than it looks (task 1.6.B5.14, read off `_status_update`):
 * - `compressing` — a MANUAL `/compress` is running (`session.compress`)
 * - `compacting` — an AUTOMATIC mid-turn compaction; arrives from the core as
 *   `lifecycle` and is re-tagged by their own handler so a driver can show it
 * - `status` — their generic bucket, used for the `ready` that ends a manual
 *   compression
 * - `process`, `goal`, … — everything else, which this app ignores */
export interface StatusUpdateEvent {
  type: 'status.update'
  session_id?: string
  payload: { kind: string; text: string }
}

/** The core scanned a tool result that came from somewhere it does not control
 * — a web page, an MCP response, a document out of the user's folders — and it
 * looks like an instruction rather than data
 * (`agent/tool_dispatch_helpers.py::_tool_output_risk_metadata`, since 0.19.0).
 *
 * Two properties worth knowing. It carries NO copy of the scanned text: the
 * findings are identifiers, not excerpts — deliberately, so the warning cannot
 * itself become a delivery mechanism. And the gateway emits it only when the
 * scan found something (`server.py`: `risk != "low"`), so it is not a stream
 * of "all clear" that a person would learn to ignore. */
export interface ToolOutputRiskEvent {
  type: 'tool.output_risk'
  session_id?: string
  payload: {
    tool_id: string
    name: string
    risk: string
    findings: string[]
    redacted: boolean
  }
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

/** The model has started writing a tool call's ARGUMENTS — the phase before
 * the call exists at all (task 1.6.B6.9).
 *
 * The payload is `{name}` and nothing else: their `tool_gen_callback` is
 * `lambda name: ... _emit("tool.generating", sid, {"name": name})`
 * (`server.py::_agent_cbs`). No `tool_id` — the id is minted later, with `tool.start`
 * — so a card raised by this event can only be matched to its `tool.start` BY
 * NAME. An earlier version of this type claimed a `tool_id` and a text; both
 * were wrong.
 *
 * Suppressed together with the rest of the tool-progress channel when
 * `display.tool_progress` is off. */
export interface ToolGeneratingEvent {
  type: 'tool.generating'
  session_id?: string
  payload?: { name?: string }
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

// --- Server→client requests (hermes 0.21.3, task 3.B5в) --------------------
// The blocking questions (clarify, approval, secret, sudo, GUI reads, MCP
// setup, tour) no longer arrive as `<kind>.request` EVENTS answered by
// `<kind>.respond` METHODS: the gateway sends a JSON-RPC request of its own
// (`GatewayServerRequestFrame`) and waits for the response frame. The one
// event left in the family is the withdrawal below.

/** A server→client request is withdrawn: the turn was interrupted, the
 * session closed, the deadline passed. The card for `id` must go — an answer
 * sent after this is dropped by the gateway. */
export interface RequestCancelEvent {
  type: 'request.cancel'
  session_id?: string
  payload: { id: string; method: string; reason?: string }
}

// ---------------------------------------------------------------------------
// Batch 6 events: the agent's terminal, its background processes and the
// core's out-of-band notices (contract: specs/workbench-panels.md). Every
// field name below is the donor's, taken from `tui_gateway/server.py` 0.19.0 at
// the line quoted on each type — none of these were renamed on the way in.
//
// `voice.*` and `preview.*` are DELIBERATELY ABSENT: both surfaces were dropped
// by owner decisions 2 and 3 of block 5, and their events are listed among the
// knowingly-ignored ones in chat-state.ts instead of being typed here.
// ---------------------------------------------------------------------------

/** A chunk of live output from a background process the agent started
 * (`server.py::_emit_agent_terminal_output`). Only two fields, and neither says WHAT is running:
 * the command, cwd and status come from `process.list` alone.
 *
 * `process_id` is their process registry's `session.id` — the same value
 * `process.list` returns under the name `session_id` (see `ProcessEntry`), NOT
 * a chat session id.
 *
 * The stream only exists once a session's notification poller has started
 * (`server.py::_wire_agent_terminal_output`, called from
 * `::_start_notification_poller`) — before the first session there is
 * nothing to receive, which is why an empty terminal tab is normal. */
export interface AgentTerminalOutputEvent {
  type: 'agent.terminal.output'
  session_id?: string
  payload: { process_id: string; chunk: string }
}

/** The agent closed its own read-only terminal TAB (`server.py::_emit_agent_terminal_close`) — their
 * comment: "the process is untouched — this only drops the view". Answering
 * this with `process.kill` would kill a running command on a "hide the view"
 * signal, so the tab goes and nothing else happens. */
export interface TerminalCloseEvent {
  type: 'terminal.close'
  session_id?: string
  payload: { process_id: string }
}

/** An out-of-band notice from the core (`server.py::_agent_cbs`) — the fields are
 * their `AgentNotice`'s (`agent/credits_tracker.py:178`), not ours.
 *
 * Two traps in the shape: `ttl_ms` is honoured ONLY when `kind` is `'ttl'`
 * (their comment; a `sticky` notice with a ttl still lives until it is
 * cleared), and `key` is the dedupe identity — a second `show` with the same
 * key REPLACES the first rather than stacking. `id` is theirs and is not used
 * for addressing anything: `notification.clear` names the key. */
export interface NotificationShowEvent {
  type: 'notification.show'
  session_id?: string
  payload: {
    text: string
    level?: 'info' | 'warn' | 'error' | 'success'
    kind?: 'sticky' | 'ttl'
    ttl_ms?: number | null
    key?: string | null
    id?: string | null
  }
}

/** The core withdraws a notice it raised (`server.py::_agent_cbs`). Addressed by
 * `key`, never by `id`; a key that was never shown is a no-op. */
export interface NotificationClearEvent {
  type: 'notification.clear'
  session_id?: string
  payload: { key?: string | null }
}

/** Progress of connecting to a browser over CDP (`server.py`, `@method("browser")`).
 *
 * NOT a tool event, despite the name: the only emitter is the `browser` RPC
 * with `action: "connect"`, and the payload carries no `tool_id` and no tool
 * name. This app never calls that method, so the event cannot currently
 * arrive — it is typed so the one place that would have to decide what to do
 * with it says so explicitly instead of guessing. */
export interface BrowserProgressEvent {
  type: 'browser.progress'
  session_id?: string
  payload: { message: string; level?: string }
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

/** The gateway renamed a session by itself (task 1.6.B5.8): their auto-titler
 * runs asynchronously after a turn and pushes the name it invented.
 *
 * A trap worth naming: the envelope's `session_id` is the LIVE sid (the frame
 * is routed like any other event), while `payload.session_id` is the STORED
 * key — their `title_callback` passes `_title_key`. A list keyed by stored ids
 * must read the payload, not the envelope. */
export interface SessionTitleEvent {
  type: 'session.title'
  session_id?: LiveSessionId
  payload?: { session_id?: StoredSessionId; title?: string }
}

export type GatewayEvent =
  | GatewayReadyEvent
  | SessionInfoEvent
  | SessionTitleEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | ThinkingDeltaEvent
  | ReasoningDeltaEvent
  | ReasoningAvailableEvent
  | StatusUpdateEvent
  | ToolOutputRiskEvent
  | MessageCompleteEvent
  | GatewayErrorEvent
  | ToolStartEvent
  | ToolStartedEvent
  | ToolGeneratingEvent
  | ToolCompleteEvent
  | RequestCancelEvent
  | SubagentEvent
  | MoaReferenceEvent
  | MoaAggregatingEvent
  | AgentTerminalOutputEvent
  | TerminalCloseEvent
  | NotificationShowEvent
  | NotificationClearEvent
  | BrowserProgressEvent
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
