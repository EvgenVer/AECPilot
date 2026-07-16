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

export type ChatItem = ChatMessage | ChatToolCall

/** A pending `approval.request` from the agent. Approvals form a FIFO queue
 * per session (no request id) and are rendered pinned above the input, not
 * in the transcript — see ChatDock/ApprovalCard. */
export interface ApprovalRequest {
  command: string
  description: string
  patternKeys: string[]
  allowPermanent: boolean
}

export interface ChatState {
  items: ChatItem[]
  streaming: boolean
  approvals: ApprovalRequest[]
  /** Next id to assign to a newly-created `ChatMessage` (see `ChatMessage.id`). */
  nextId: number
}

export const initialChatState: ChatState = {
  items: [],
  streaming: false,
  approvals: [],
  nextId: 0
}

export type ChatAction =
  | { kind: 'user-submit'; text: string }
  | { kind: 'event'; event: GatewayEvent }
  | { kind: 'approvals-resolved'; count: number }
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
    if (item.kind === 'tool') continue
    if (item.role === 'assistant' && item.status === 'streaming') return i
    break
  }
  return undefined
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
    return { ...state, items: [...state.items, message], nextId }
  }

  if (action.kind === 'approvals-resolved') {
    const count = Math.min(action.count, state.approvals.length)
    return { ...state, approvals: state.approvals.slice(count) }
  }

  if (action.kind === 'session-loaded') {
    const mapped = action.messages
      .map(mapHistoryMessage)
      .filter((item): item is ChatItem => item !== undefined)
    let nextId = 0
    const items = mapped.map((item) => (item.kind === 'message' ? { ...item, id: nextId++ } : item))
    return { items, approvals: [], streaming: false, nextId }
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
    if (index === undefined) {
      // Implicit start: a complete arrived with no prior message.start/delta.
      const { message, nextId } = createMessage(state.nextId, {
        role: 'assistant',
        text: finalText,
        status: event.payload.status
      })
      return { ...state, items: [...state.items, message], nextId, streaming: false }
    }
    const items = [...state.items]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: finalText, status: event.payload.status }
    return { ...state, items, streaming: false }
  }

  if (isGatewayEventOfType(event, 'error')) {
    const index = inFlightIndex(state.items)
    if (index === undefined) {
      const { message, nextId } = createMessage(state.nextId, {
        role: 'assistant',
        text: event.payload.message,
        status: 'error'
      })
      return {
        ...state,
        items: [...state.items, message],
        nextId,
        streaming: false
      }
    }
    const items = [...state.items]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: current.text || event.payload.message, status: 'error' }
    return { ...state, items, streaming: false }
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

  // 'thinking.delta' / 'status.update' / 'gateway.ready' / anything unknown
  // are ignored for 0.11/0.12 — kept minimal per the task brief.
  return state
}
