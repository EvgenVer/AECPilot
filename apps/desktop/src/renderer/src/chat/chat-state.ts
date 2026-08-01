// Pure reducer driving the chat panel (tasks 0.11, 0.12). Framework-free —
// no React import here — so it can be unit-tested directly with vitest and
// reused unchanged if the panel is ever restructured.

import {
  isGatewayEventOfType,
  type GatewayEvent,
  type HistoryMessage,
  type SubagentEvent
} from '../../../shared/gateway/types'

export interface ChatMessage {
  kind: 'message'
  /** Monotonic, stable id assigned once at creation (task 1.0, nit from
   * 0.12/0.14 review) — used as the React `key` instead of array index, so a
   * tool card inserted before an in-flight streaming bubble (which shifts
   * every later index) never causes it to remount. */
  id: number
  role: 'user' | 'assistant'
  text: string
  status?: 'streaming' | 'complete' | 'error' | 'interrupted'
}

export interface ChatToolCall {
  kind: 'tool'
  toolId: string
  name: string
  context: string
  args?: unknown
  durationS?: number
  result?: string
  status: 'running' | 'complete'
}

/** The agent's reasoning trace for one turn (task 1.5.D1), rendered as a
 * single collapsible card per design/screens/Chat.html §5.9 — not one card
 * per chunk. `thinking.delta`, `reasoning.delta` and `reasoning.available`
 * all feed the same item (hermes splits them across two agent callbacks;
 * to the reader it is one train of thought).
 *
 * `segments` backs the design's "N шагов": it counts how many times
 * reasoning RESUMED after something else appeared in between (a tool card,
 * an answer chunk) — not the raw delta count, which would be meaningless.
 * A turn that reasons, calls a tool, then reasons again reads as 2 steps.
 *
 * `startedAt`/`endedAt` come from the dispatcher (`ChatAction.receivedAt`),
 * never from a clock read inside the reducer — the reducer stays pure. When
 * the dispatcher supplies no timestamp they stay undefined and the card
 * simply omits the duration (specs/agent-chat.md: мета не выдумывается). */
export interface ChatReasoning {
  kind: 'reasoning'
  /** Monotonic, stable React key — same scheme as `ChatMessage.id`. */
  id: number
  text: string
  segments: number
  status: 'streaming' | 'complete'
  startedAt?: number
  endedAt?: number
}

/** A delegated child agent (task 1.6.A1). One card per child, updated in
 * place by its own `subagent.*` events. `parentId`/`depth` carry their spawn
 * tree so a child of a child renders nested rather than flat — both are
 * optional in the protocol, and their own comment says an emitter that omits
 * them is meant to render flat. */
export interface ChatSubagent {
  kind: 'subagent'
  /** Stable React key: their `subagent_id` when present, else a synthesized
   * one — the transcript must never key on the array index. */
  id: string
  goal: string
  model?: string
  parentId?: string
  depth: number
  taskIndex: number
  taskCount: number
  /** Last thing it was seen doing — its thinking preview or a tool preview. */
  activity?: string
  toolCount: number
  status: 'running' | 'complete' | 'interrupted'
  summary?: string
  durationS?: number
}

/** A Mixture-of-Agents turn (task 1.6.A2): several models are consulted and
 * one aggregates them. One card per turn, listing who was asked. */
export interface ChatMoa {
  kind: 'moa'
  id: number
  models: string[]
  expected?: number
  aggregator?: string
  status: 'consulting' | 'aggregating'
}

/** The agent saved a skill or a memory (task 1.6.B3.12).
 *
 * Emitted as `review.summary` by their background review — the gateway wires
 * `agent.background_review_callback` to it (`tui_gateway/server.py`), so the
 * text is already the human-facing summary their CLI would print.
 *
 * A permanent transcript item rather than a toast, and deliberately so: this
 * is the only notification that the agent CHANGED ITSELF. A toast that expires
 * would leave the user unable to find out what was learned five minutes ago. */
export interface ChatNotice {
  kind: 'notice'
  id: number
  text: string
}

export type ChatItem =
  ChatMessage | ChatToolCall | ChatReasoning | ChatSubagent | ChatMoa | ChatNotice

/** A pending `approval.request` from the agent. Approvals form a FIFO queue
 * per session (no request id) and are rendered pinned above the input, not
 * in the transcript — see ChatDock/ApprovalCard. */
export interface ApprovalRequest {
  command: string
  description: string
  patternKeys: string[]
  allowPermanent: boolean
}

/** A blocking interactive request from the agent (task 1.5.D1). Unlike
 * approvals — a FIFO queue with no ids — each of these carries a
 * `requestId` the answer must echo, so they are matched by id rather than
 * by position. The agent core is stopped while one is outstanding, so these
 * are pinned above the composer (like `ApprovalCard`) rather than dropped
 * into the transcript, which does not auto-scroll and could hide them. */
export type InteractiveRequest =
  | { kind: 'clarify'; requestId: string; question: string; choices: string[] }
  | { kind: 'secret'; requestId: string; prompt: string; envVar: string }
  | { kind: 'sudo'; requestId: string }

/** What the agent is actually running with right now (task 1.6.9).
 *
 * The composer's picker must not show what the user last clicked — it must
 * show what took effect. Their `config.set` can answer "switched" and still
 * leave the live agent on the old model (an unauthenticated provider, a
 * cost confirmation), so this is filled ONLY from their `session.info`
 * event, which reports the agent's own attributes. */
export interface SessionRuntime {
  model: string
  provider: string
  /** '' means "provider default"; 'none' means thinking is off — their side
   * distinguishes the two deliberately, and collapsing them here would make
   * the picker forget an explicit "off". */
  reasoningEffort: string
  fast: boolean
}

export const emptySessionRuntime: SessionRuntime = {
  model: '',
  provider: '',
  reasoningEffort: '',
  fast: false
}

export interface ChatState {
  items: ChatItem[]
  streaming: boolean
  approvals: ApprovalRequest[]
  /** Outstanding blocking requests, oldest first. */
  interactive: InteractiveRequest[]
  /** Next id to assign to a newly-created `ChatMessage` (see `ChatMessage.id`). */
  nextId: number
  /** Live model/effort/fast, as last reported by the gateway. */
  runtime: SessionRuntime
}

export const initialChatState: ChatState = {
  items: [],
  streaming: false,
  approvals: [],
  interactive: [],
  nextId: 0,
  runtime: emptySessionRuntime
}

// --- Hermes parity ledger (task 1.5.D1 / D1.9) -----------------------------
// Single source of truth for "which gateway events does the chat act on".
// Two consumers:
//   1. the dev-only unhandled-event warning (Shell) — so a hermes upgrade
//      that introduces new events is visible instead of silently dropped;
//   2. runtime/hermes-event-diff.mjs, which parses these lists and diffs them
//      against the event names found in the installed hermes TUI bundle.
// Keep both lists in sync with the reducer below when adding a branch.

/** Events the reducer acts on. */
export const HANDLED_GATEWAY_EVENTS = [
  'message.start',
  'message.delta',
  'message.complete',
  'error',
  'thinking.delta',
  'reasoning.delta',
  'reasoning.available',
  'tool.start',
  'tool.started',
  'tool.generating',
  'tool.complete',
  'approval.request',
  'clarify.request',
  'secret.request',
  'sudo.request',
  'subagent.start',
  'subagent.thinking',
  'subagent.tool',
  'subagent.complete',
  'subagent.interrupt',
  'moa.reference',
  'moa.aggregating',
  'session.info',
  'review.summary',
  'secret.expire',
  'sudo.expire'
] as const

/** Events we knowingly ignore — no warning, they are not a parity gap.
 *
 * The last three arrived with hermes 0.19.0 and are listed so the upgrade does
 * not fill the console with "unknown event" noise. Each has a reason:
 * - `message.interim` — a provisional answer their side later replaces; the
 *   final one arrives as `message.delta`/`message.complete` anyway, and
 *   rendering both would show the answer twice
 * - `reaction` — their emoji-reaction feature, which this app has no surface
 *   for
 * - `tool.output_risk` — a heuristic warning about a tool's output. Ignored
 *   for now rather than shown, because a warning with no explanation of what
 *   to do is worse than none; §Discovered in TASKS records it as a candidate
 *   for the tool card. */
export const IGNORED_GATEWAY_EVENTS = [
  'gateway.ready',
  'status.update',
  'message.interim',
  'reaction',
  'tool.output_risk'
] as const

const KNOWN_EVENTS = new Set<string>([...HANDLED_GATEWAY_EVENTS, ...IGNORED_GATEWAY_EVENTS])

/** True for an event neither handled nor deliberately ignored — i.e. one we
 * may have started missing after a hermes upgrade. */
export function isUnknownGatewayEvent(type: string): boolean {
  return !KNOWN_EVENTS.has(type)
}

/** How many items of each kind the transcript holds (task 1.6.2).
 *
 * This is the instrument that separates the two candidate explanations of
 * "карточки хода пропадают после ответа": if the census still counts the
 * cards after `message.complete`, the state kept them and the problem is in
 * what the user SEES (scroll position, clipping); if the count drops, an
 * event we do not yet understand is removing them. Counts only — never text,
 * never ids of content, so it is safe to log (specs/agent-chat.md §Security). */
export function transcriptCensus(items: ChatItem[]): {
  messages: number
  tools: number
  reasoning: number
  subagents: number
  moa: number
} {
  let messages = 0
  let tools = 0
  let reasoning = 0
  let subagents = 0
  let moa = 0
  for (const item of items) {
    if (item.kind === 'message') messages++
    else if (item.kind === 'tool') tools++
    else if (item.kind === 'reasoning') reasoning++
    else if (item.kind === 'subagent') subagents++
    else moa++
  }
  return { messages, tools, reasoning, subagents, moa }
}

export type ChatAction =
  | { kind: 'user-submit'; text: string }
  /** `receivedAt` (task 1.5.D1) is supplied by the dispatcher so the reducer
   * can time the reasoning block without reading a clock itself (purity —
   * see `ChatReasoning`). Optional: omitted in tests and by any caller that
   * doesn't care, in which case no duration is recorded. */
  | { kind: 'event'; event: GatewayEvent; receivedAt?: number }
  | { kind: 'approvals-resolved'; count: number }
  /** Drops an answered (or expired) interactive request by its id. */
  | { kind: 'interactive-resolved'; requestId: string }
  | { kind: 'session-loaded'; messages: HistoryMessage[] }

/** The in-flight assistant message, if any, is always the last *message*
 * item while it carries status 'streaming' — tool cards may sit after it in
 * the array (appended once the answer has already started streaming), so
 * this scans backward from the end and skips over tool cards rather than
 * only checking the very last item. Only one turn can be in-flight at a
 * time. */
function inFlightIndex(items: ChatItem[]): number | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    // Tool cards, reasoning blocks (task 1.5.D1) and — since 1.6.A1/A2 —
    // subagent and MoA cards may all sit after the in-flight bubble; skip
    // over them rather than giving up at the first non-message item.
    if (item.kind !== 'message') continue
    if (item.role === 'assistant' && item.status === 'streaming') return i
    break
  }
  return undefined
}

/** Index of the turn's still-open reasoning block, if any. At most one is
 * open at a time — it is closed by `message.complete` (or by the next user
 * turn, as a safety net). */
function openReasoningIndex(items: ChatItem[]): number | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind === 'reasoning' && item.status === 'streaming') return i
  }
  return undefined
}

/** Closes an open reasoning block, stamping `endedAt` when the dispatcher
 * gave us a timestamp. Returns `items` unchanged when nothing is open. */
function closeReasoning(items: ChatItem[], receivedAt?: number): ChatItem[] {
  const index = openReasoningIndex(items)
  if (index === undefined) return items
  const next = [...items]
  const current = next[index] as ChatReasoning
  next[index] = {
    ...current,
    status: 'complete',
    ...(receivedAt !== undefined ? { endedAt: receivedAt } : {})
  }
  return next
}

/** Feeds one reasoning chunk into the turn's block, creating it if this is
 * the first chunk of the turn. A chunk arriving when the block is no longer
 * the last item means reasoning resumed after a tool call / answer chunk —
 * that bumps `segments` and separates the text with a blank line. */
function appendReasoning(state: ChatState, text: string, receivedAt?: number): ChatState {
  if (text === '') return state
  const index = openReasoningIndex(state.items)

  if (index === undefined) {
    const block: ChatReasoning = {
      kind: 'reasoning',
      id: state.nextId,
      text,
      segments: 1,
      status: 'streaming',
      ...(receivedAt !== undefined ? { startedAt: receivedAt } : {})
    }
    return { ...state, items: [...state.items, block], nextId: state.nextId + 1 }
  }

  const items = [...state.items]
  const current = items[index] as ChatReasoning
  const resumed = index !== items.length - 1
  items[index] = {
    ...current,
    text: resumed ? `${current.text}\n\n${text}` : current.text + text,
    segments: resumed ? current.segments + 1 : current.segments
  }
  return { ...state, items }
}

/** Normalizes a `tool.complete` result into a display string: an object is
 * pretty-printed as JSON; a string that itself parses as JSON is
 * pretty-printed; any other string is kept as-is. */
function normalizeToolResult(result: string | object): string {
  if (typeof result !== 'string') return JSON.stringify(result, null, 2)
  try {
    return JSON.stringify(JSON.parse(result), null, 2)
  } catch {
    return result
  }
}

/** Creates a new `ChatMessage` with the next monotonic id from `nextId`,
 * returning both the message and the incremented counter to store back on
 * state. */
function createMessage(
  nextId: number,
  fields: Omit<ChatMessage, 'kind' | 'id'>
): { message: ChatMessage; nextId: number } {
  return { message: { kind: 'message', id: nextId, ...fields }, nextId: nextId + 1 }
}

/** Index of the tool card with the given toolId, if one exists. */
function toolCardIndex(items: ChatItem[], toolId: string): number | undefined {
  const index = items.findIndex((item) => item.kind === 'tool' && item.toolId === toolId)
  return index === -1 ? undefined : index
}

/** Upserts a running tool card for `payload`: if a card with this toolId
 * already exists, the item list is returned unchanged (no duplication,
 * `tool.start` and `tool.started` are equivalent). Otherwise a new running
 * card is inserted immediately before the in-flight streaming assistant
 * message if its text is still empty (tools render above the answer),
 * otherwise appended at the end. */
function upsertRunningToolCard(
  items: ChatItem[],
  payload: { tool_id: string; name: string; context: string }
): ChatItem[] {
  if (toolCardIndex(items, payload.tool_id) !== undefined) return items

  const card: ChatToolCall = {
    kind: 'tool',
    toolId: payload.tool_id,
    name: payload.name,
    context: payload.context,
    status: 'running'
  }

  const flightIndex = inFlightIndex(items)
  if (flightIndex !== undefined && (items[flightIndex] as ChatMessage).text === '') {
    return [...items.slice(0, flightIndex), card, ...items.slice(flightIndex)]
  }
  return [...items, card]
}

/** Maps a `session.history`/`session.resume` history entry to a `ChatItem`,
 * or `undefined` for a 'system' role or any unrecognized role — those are
 * skipped rather than rendered. Tolerant of missing fields (never throws). */
function mapHistoryMessage(message: HistoryMessage, index: number): ChatItem | undefined {
  if (message.role === 'user' || message.role === 'assistant') {
    return {
      kind: 'message',
      // Placeholder — the reducer's 'session-loaded' branch reassigns real
      // monotonic ids to every mapped message in order, since this function
      // has no running counter of its own.
      id: 0,
      role: message.role,
      text: message.text ?? '',
      status: message.role === 'assistant' ? 'complete' : undefined
    }
  }
  if (message.role === 'tool') {
    return {
      kind: 'tool',
      toolId: `hist-${index}`,
      name: message.name ?? '',
      context: message.context ?? '',
      status: 'complete'
    }
  }
  return undefined
}

/** All five `subagent.*` events share one payload shape, so one predicate
 * narrows them together. A chain of five `isGatewayEventOfType` calls would
 * not: each `||` operand is checked with the previous one negated, and since
 * every branch narrows to the same `SubagentEvent`, the last one would be
 * `never`. */
function isSubagentEvent(event: GatewayEvent): event is SubagentEvent {
  return event.type.startsWith('subagent.')
}

/** What a finished turn resets (task 1.6.12, parity with hermes desktop
 * `gateway-event.ts`, which calls `clearAllPrompts(sessionId)` on both
 * `message.complete` and `error`).
 *
 * The agent core blocks the turn while it waits on an approval / clarify /
 * secret / sudo request, so once the turn is over NOTHING is waiting on those
 * answers any more: the request either was resolved, or it expired on the core
 * side (approval fails closed — "silence is not consent" — and clarify/secret
 * give up with an empty answer). Keeping the card pinned after that would wedge
 * the dock: the composer is disabled while an approval is up, so an expired
 * request the gateway has already forgotten would lock the input for good. */
function endedTurn(): Pick<ChatState, 'streaming' | 'approvals' | 'interactive'> {
  return { streaming: false, approvals: [], interactive: [] }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.kind === 'user-submit') {
    const { message, nextId } = createMessage(state.nextId, { role: 'user', text: action.text })
    // Safety net (task 1.5.D1): a new user turn closes any reasoning block
    // left open by a turn that never delivered `message.complete`.
    const items = closeReasoning(state.items)
    return { ...state, items: [...items, message], nextId }
  }

  if (action.kind === 'approvals-resolved') {
    const count = Math.min(action.count, state.approvals.length)
    return { ...state, approvals: state.approvals.slice(count) }
  }

  if (action.kind === 'interactive-resolved') {
    const interactive = state.interactive.filter((r) => r.requestId !== action.requestId)
    // Answering something already gone is a no-op, not a state churn.
    return interactive.length === state.interactive.length ? state : { ...state, interactive }
  }

  if (action.kind === 'session-loaded') {
    const mapped = action.messages
      .map(mapHistoryMessage)
      .filter((item): item is ChatItem => item !== undefined)
    let nextId = 0
    const items = mapped.map((item) => (item.kind === 'message' ? { ...item, id: nextId++ } : item))
    // Switching/reloading a session abandons any outstanding blocking
    // request along with the transcript (task 1.5.D1). The runtime goes too
    // (task 1.6.9): the new session has its own agent, and keeping the old
    // model in the picker would misname who is answering. Their gateway
    // emits `session.info` right after it builds the agent, so the blank is
    // momentary rather than permanent.
    return {
      items,
      approvals: [],
      interactive: [],
      streaming: false,
      nextId,
      runtime: emptySessionRuntime
    }
  }

  const { event } = action

  // A plain `switch (event.type)` does not narrow `event.payload` here for
  // the same reason documented on `isGatewayEventOfType` in types.ts:
  // `UnknownGatewayEvent.type` is `string`, so TypeScript can't rule it out
  // as a case-match candidate and `payload` stays `unknown`. Use the typed
  // predicate instead, matching the convention already used in
  // events-parsing.test.ts.

  if (isGatewayEventOfType(event, 'message.start')) {
    const { message, nextId } = createMessage(state.nextId, {
      role: 'assistant',
      text: '',
      status: 'streaming'
    })
    return { ...state, items: [...state.items, message], nextId, streaming: true }
  }

  if (isGatewayEventOfType(event, 'message.delta')) {
    const index = inFlightIndex(state.items)
    if (index === undefined) {
      // Implicit start: a delta arrived with no prior message.start.
      const { message, nextId } = createMessage(state.nextId, {
        role: 'assistant',
        text: event.payload.text,
        status: 'streaming'
      })
      return { ...state, items: [...state.items, message], nextId, streaming: true }
    }
    const items = [...state.items]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: current.text + event.payload.text }
    return { ...state, items, streaming: true }
  }

  if (isGatewayEventOfType(event, 'message.complete')) {
    const index = inFlightIndex(state.items)
    const finalText =
      event.payload.text || (index !== undefined ? (state.items[index] as ChatMessage).text : '')
    // The turn is over — seal its reasoning block (task 1.5.D1). Replaces in
    // place, so `index` from above stays valid.
    const closed = closeReasoning(state.items, action.receivedAt)
    if (index === undefined) {
      // Implicit start: a complete arrived with no prior message.start/delta.
      const { message, nextId } = createMessage(state.nextId, {
        role: 'assistant',
        text: finalText,
        status: event.payload.status
      })
      return { ...state, ...endedTurn(), items: [...closed, message], nextId }
    }
    const items = [...closed]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: finalText, status: event.payload.status }
    return { ...state, ...endedTurn(), items }
  }

  if (isGatewayEventOfType(event, 'error')) {
    const index = inFlightIndex(state.items)
    // An errored turn is still a finished turn — seal its reasoning block.
    const closed = closeReasoning(state.items, action.receivedAt)
    if (index === undefined) {
      const { message, nextId } = createMessage(state.nextId, {
        role: 'assistant',
        text: event.payload.message,
        status: 'error'
      })
      return {
        ...state,
        ...endedTurn(),
        items: [...closed, message],
        nextId
      }
    }
    const items = [...closed]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: current.text || event.payload.message, status: 'error' }
    return { ...state, ...endedTurn(), items }
  }

  // Task 1.5.D1: all three reasoning-ish events feed one block per turn.
  if (
    isGatewayEventOfType(event, 'thinking.delta') ||
    isGatewayEventOfType(event, 'reasoning.delta') ||
    isGatewayEventOfType(event, 'reasoning.available')
  ) {
    return appendReasoning(state, event.payload.text, action.receivedAt)
  }

  if (isGatewayEventOfType(event, 'tool.start') || isGatewayEventOfType(event, 'tool.started')) {
    return { ...state, items: upsertRunningToolCard(state.items, event.payload) }
  }

  if (isGatewayEventOfType(event, 'tool.generating')) {
    const toolId = event.payload?.tool_id
    const text = event.payload?.text ?? event.payload?.context
    if (toolId === undefined || typeof text !== 'string') return state
    const index = toolCardIndex(state.items, toolId)
    if (index === undefined) return state
    const items = [...state.items]
    items[index] = { ...(items[index] as ChatToolCall), context: text }
    return { ...state, items }
  }

  if (isGatewayEventOfType(event, 'tool.complete')) {
    const { tool_id, name, args, duration_s, result } = event.payload
    const resultText = normalizeToolResult(result)
    const index = toolCardIndex(state.items, tool_id)
    if (index === undefined) {
      const card: ChatToolCall = {
        kind: 'tool',
        toolId: tool_id,
        name,
        context: '',
        args,
        durationS: duration_s,
        result: resultText,
        status: 'complete'
      }
      return { ...state, items: [...state.items, card] }
    }
    const items = [...state.items]
    const current = items[index] as ChatToolCall
    items[index] = {
      ...current,
      args,
      durationS: duration_s,
      result: resultText,
      status: 'complete'
    }
    return { ...state, items }
  }

  // --- What the agent is actually running with (task 1.6.9) ----------------
  // The picker reads THIS, never the last click: their `config.set` can report
  // a switch the live agent did not take. Fields absent from the payload keep
  // their previous value — this event is emitted on every runtime change, not
  // only on a full one.
  if (isGatewayEventOfType(event, 'session.info')) {
    const payload = event.payload ?? {}
    const runtime: SessionRuntime = {
      model: payload.model ?? state.runtime.model,
      provider: payload.provider ?? state.runtime.provider,
      reasoningEffort: payload.reasoning_effort ?? state.runtime.reasoningEffort,
      fast: payload.fast ?? state.runtime.fast
    }
    return { ...state, runtime }
  }

  // --- Delegated child agents (task 1.6.A1) --------------------------------
  // Five events reach the PARENT session, not six: `subagent.text` (the
  // child's reply tokens) is deliberately not emitted here — see
  // `SubagentEvent`'s doc comment. All of them carry the same payload shape,
  // so one upsert serves them all.
  if (isSubagentEvent(event)) {
    const payload = event.payload ?? ({} as (typeof event)['payload'])
    // Identity is optional in their protocol. Without it every child of one
    // turn would collapse into a single card, so fall back to the goal, which
    // is what actually distinguishes two children of the same parent.
    const id = payload.subagent_id ?? `goal:${payload.goal ?? ''}`
    const index = state.items.findIndex((item) => item.kind === 'subagent' && item.id === id)

    const status: ChatSubagent['status'] =
      event.type === 'subagent.complete'
        ? 'complete'
        : event.type === 'subagent.interrupt'
          ? 'interrupted'
          : 'running'

    if (index === -1) {
      const card: ChatSubagent = {
        kind: 'subagent',
        id,
        goal: payload.goal ?? '',
        model: payload.model,
        parentId: payload.parent_id,
        depth: payload.depth ?? 0,
        taskIndex: payload.task_index ?? 0,
        taskCount: payload.task_count ?? 1,
        activity: payload.text,
        toolCount: event.type === 'subagent.tool' ? 1 : 0,
        status,
        summary: payload.summary,
        durationS: payload.duration_seconds
      }
      return { ...state, items: [...state.items, card] }
    }

    const items = [...state.items]
    const current = items[index] as ChatSubagent
    items[index] = {
      ...current,
      // A later event may carry fields the first one lacked; it must never
      // blank a field it simply does not repeat.
      goal: payload.goal || current.goal,
      model: payload.model ?? current.model,
      activity: payload.text ?? current.activity,
      toolCount: event.type === 'subagent.tool' ? current.toolCount + 1 : current.toolCount,
      status,
      summary: payload.summary ?? current.summary,
      durationS: payload.duration_seconds ?? current.durationS
    }
    return { ...state, items }
  }

  // --- Mixture of Agents (task 1.6.A2) -------------------------------------
  // One card per turn: `moa.reference` names each model consulted,
  // `moa.aggregating` says who merges them. Both fold into the last MoA card
  // of the transcript, creating it if this is the first signal of the turn.
  if (
    isGatewayEventOfType(event, 'moa.reference') ||
    isGatewayEventOfType(event, 'moa.aggregating')
  ) {
    const payload = event.payload ?? ({} as (typeof event)['payload'])
    let index = -1
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      if (state.items[i]?.kind === 'moa') {
        index = i
        break
      }
    }
    const aggregating = isGatewayEventOfType(event, 'moa.aggregating')
    const model = aggregating ? undefined : (payload as { model?: string }).model
    const expected = aggregating ? undefined : (payload as { count?: number }).count
    const aggregator = aggregating ? (payload as { aggregator?: string }).aggregator : undefined

    if (index === -1) {
      const card: ChatMoa = {
        kind: 'moa',
        id: state.nextId,
        models: model ? [model] : [],
        expected,
        aggregator,
        status: aggregating ? 'aggregating' : 'consulting'
      }
      return { ...state, items: [...state.items, card], nextId: state.nextId + 1 }
    }

    const items = [...state.items]
    const current = items[index] as ChatMoa
    items[index] = {
      ...current,
      // A model consulted twice is still one model in the list.
      models:
        model && !current.models.includes(model) ? [...current.models, model] : current.models,
      expected: expected ?? current.expected,
      aggregator: aggregator ?? current.aggregator,
      status: aggregating ? 'aggregating' : current.status
    }
    return { ...state, items }
  }

  // The agent saved a skill or a memory. Appended to the transcript, where it
  // stays — nothing in the reducer removes notices, which is the point (task
  // 1.6.B3.12).
  if (event.type === 'review.summary') {
    const text = String((event.payload as { text?: unknown } | undefined)?.text ?? '').trim()
    if (text === '') return state
    const notice: ChatNotice = { kind: 'notice', id: state.nextId, text }
    return { ...state, items: [...state.items, notice], nextId: state.nextId + 1 }
  }

  if (isGatewayEventOfType(event, 'approval.request')) {
    const payload = event.payload ?? {}
    const request: ApprovalRequest = {
      command: payload.command ?? '',
      description: payload.description ?? '',
      patternKeys: payload.pattern_keys ?? [],
      allowPermanent: payload.allow_permanent ?? false
    }
    return { ...state, approvals: [...state.approvals, request] }
  }

  // Task 1.5.D1: blocking interactive requests. Queued by `request_id`; a
  // repeat of one already queued is dropped rather than shown twice.
  if (
    isGatewayEventOfType(event, 'clarify.request') ||
    isGatewayEventOfType(event, 'secret.request') ||
    isGatewayEventOfType(event, 'sudo.request')
  ) {
    const requestId = event.payload?.request_id
    // Without an id we could never answer it — the gateway matches replies by
    // request_id — so there is nothing useful to show.
    if (typeof requestId !== 'string' || requestId === '') return state
    if (state.interactive.some((r) => r.requestId === requestId)) return state

    let request: InteractiveRequest
    if (isGatewayEventOfType(event, 'clarify.request')) {
      request = {
        kind: 'clarify',
        requestId,
        question: event.payload.question ?? '',
        choices: event.payload.choices ?? []
      }
    } else if (isGatewayEventOfType(event, 'secret.request')) {
      request = {
        kind: 'secret',
        requestId,
        prompt: event.payload.prompt ?? '',
        envVar: event.payload.env_var ?? ''
      }
    } else {
      request = { kind: 'sudo', requestId }
    }
    return { ...state, interactive: [...state.interactive, request] }
  }

  // The gateway says a blocking request timed out (hermes 0.19.0). Before
  // this, a card whose 300 s / 120 s window had expired stayed on screen until
  // the turn ended — the user could still type into it, and the answer went
  // nowhere (error 4009). Removing it by id is what their own UI does.
  //
  // Matched by id, never "clear the queue": a second request may have arrived
  // while the first was waiting, and dropping it would take a live prompt off
  // the screen while the agent still blocks on it.
  if (event.type === 'secret.expire' || event.type === 'sudo.expire') {
    const requestId = (event.payload as { request_id?: unknown } | undefined)?.request_id
    if (typeof requestId !== 'string' || requestId === '') return state
    const kind = event.type === 'secret.expire' ? 'secret' : 'sudo'
    const remaining = state.interactive.filter(
      (request) => !(request.requestId === requestId && request.kind === kind)
    )
    // Identity is preserved when nothing matched, so an expiry for a request
    // this window never saw causes no re-render.
    return remaining.length === state.interactive.length
      ? state
      : { ...state, interactive: remaining }
  }

  // 'status.update' / 'gateway.ready' / anything unknown are ignored.
  // (`thinking.delta` used to be ignored here too — task 1.5.D1 now feeds it
  // into the reasoning block, see above.)
  return state
}
