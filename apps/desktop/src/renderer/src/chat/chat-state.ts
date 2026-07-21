// Pure reducer driving the chat panel (tasks 0.11, 0.12). Framework-free —
// no React import here — so it can be unit-tested directly with vitest and
// reused unchanged if the panel is ever restructured.

import {
  isGatewayEventOfType,
  type GatewayEvent,
  type HistoryMessage
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

export type ChatItem = ChatMessage | ChatToolCall | ChatReasoning

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

export interface ChatState {
  items: ChatItem[]
  streaming: boolean
  approvals: ApprovalRequest[]
  /** Outstanding blocking requests, oldest first. */
  interactive: InteractiveRequest[]
  /** Next id to assign to a newly-created `ChatMessage` (see `ChatMessage.id`). */
  nextId: number
}

export const initialChatState: ChatState = {
  items: [],
  streaming: false,
  approvals: [],
  interactive: [],
  nextId: 0
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
  'sudo.request'
] as const

/** Events we knowingly ignore — no warning, they are not a parity gap. */
export const IGNORED_GATEWAY_EVENTS = ['gateway.ready', 'status.update', 'session.info'] as const

const KNOWN_EVENTS = new Set<string>([...HANDLED_GATEWAY_EVENTS, ...IGNORED_GATEWAY_EVENTS])

/** True for an event neither handled nor deliberately ignored — i.e. one we
 * may have started missing after a hermes upgrade. */
export function isUnknownGatewayEvent(type: string): boolean {
  return !KNOWN_EVENTS.has(type)
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
    // Tool cards and reasoning blocks (task 1.5.D1) may both sit after the
    // in-flight bubble — skip over them rather than giving up at the first
    // non-message item.
    if (item.kind === 'tool' || item.kind === 'reasoning') continue
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
    // request along with the transcript (task 1.5.D1).
    return { items, approvals: [], interactive: [], streaming: false, nextId }
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
      return { ...state, items: [...closed, message], nextId, streaming: false }
    }
    const items = [...closed]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: finalText, status: event.payload.status }
    return { ...state, items, streaming: false }
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
        items: [...closed, message],
        nextId,
        streaming: false
      }
    }
    const items = [...closed]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: current.text || event.payload.message, status: 'error' }
    return { ...state, items, streaming: false }
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

  // 'status.update' / 'gateway.ready' / anything unknown are ignored.
  // (`thinking.delta` used to be ignored here too — task 1.5.D1 now feeds it
  // into the reasoning block, see above.)
  return state
}
