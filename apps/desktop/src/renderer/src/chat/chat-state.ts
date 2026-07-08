// Pure reducer driving the chat panel (tasks 0.11, 0.12). Framework-free —
// no React import here — so it can be unit-tested directly with vitest and
// reused unchanged if the panel is ever restructured.

import { isGatewayEventOfType, type GatewayEvent } from '../../../shared/gateway/types'

export interface ChatMessage {
  kind: 'message'
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

export interface ChatState {
  items: ChatItem[]
  streaming: boolean
}

export const initialChatState: ChatState = {
  items: [],
  streaming: false
}

export type ChatAction =
  { kind: 'user-submit'; text: string } | { kind: 'event'; event: GatewayEvent }

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

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.kind === 'user-submit') {
    return {
      ...state,
      items: [...state.items, { kind: 'message', role: 'user', text: action.text }]
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
    return {
      items: [
        ...state.items,
        { kind: 'message', role: 'assistant', text: '', status: 'streaming' }
      ],
      streaming: true
    }
  }

  if (isGatewayEventOfType(event, 'message.delta')) {
    const index = inFlightIndex(state.items)
    if (index === undefined) {
      // Implicit start: a delta arrived with no prior message.start.
      return {
        items: [
          ...state.items,
          { kind: 'message', role: 'assistant', text: event.payload.text, status: 'streaming' }
        ],
        streaming: true
      }
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
      return {
        items: [
          ...state.items,
          { kind: 'message', role: 'assistant', text: finalText, status: event.payload.status }
        ],
        streaming: false
      }
    }
    const items = [...state.items]
    items[index] = {
      kind: 'message',
      role: 'assistant',
      text: finalText,
      status: event.payload.status
    }
    return { items, streaming: false }
  }

  if (isGatewayEventOfType(event, 'error')) {
    const index = inFlightIndex(state.items)
    if (index === undefined) {
      return {
        items: [
          ...state.items,
          { kind: 'message', role: 'assistant', text: event.payload.message, status: 'error' }
        ],
        streaming: false
      }
    }
    const items = [...state.items]
    const current = items[index] as ChatMessage
    items[index] = { ...current, text: current.text || event.payload.message, status: 'error' }
    return { items, streaming: false }
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

  // 'thinking.delta' / 'status.update' / 'gateway.ready' / anything unknown
  // are ignored for 0.11/0.12 — kept minimal per the task brief.
  return state
}
