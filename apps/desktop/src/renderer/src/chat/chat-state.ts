// Pure reducer driving the chat panel (task 0.11). Framework-free — no React
// import here — so it can be unit-tested directly with vitest and reused
// unchanged if the panel is ever restructured.

import { isGatewayEventOfType, type GatewayEvent } from '../../../shared/gateway/types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  status?: 'streaming' | 'complete' | 'error' | 'interrupted'
}

export interface ChatState {
  messages: ChatMessage[]
  streaming: boolean
}

export const initialChatState: ChatState = {
  messages: [],
  streaming: false
}

export type ChatAction =
  { kind: 'user-submit'; text: string } | { kind: 'event'; event: GatewayEvent }

/** The in-flight assistant message, if any, is always the last message in
 * the array while it carries status 'streaming' — only one turn can be
 * in-flight at a time. */
function inFlightIndex(messages: ChatMessage[]): number | undefined {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant' && last.status === 'streaming') return messages.length - 1
  return undefined
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.kind === 'user-submit') {
    return {
      ...state,
      messages: [...state.messages, { role: 'user', text: action.text }]
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
      messages: [...state.messages, { role: 'assistant', text: '', status: 'streaming' }],
      streaming: true
    }
  }

  if (isGatewayEventOfType(event, 'message.delta')) {
    const index = inFlightIndex(state.messages)
    if (index === undefined) {
      // Implicit start: a delta arrived with no prior message.start.
      return {
        messages: [
          ...state.messages,
          { role: 'assistant', text: event.payload.text, status: 'streaming' }
        ],
        streaming: true
      }
    }
    const messages = [...state.messages]
    const current = messages[index]
    messages[index] = { ...current, text: current.text + event.payload.text }
    return { ...state, messages, streaming: true }
  }

  if (isGatewayEventOfType(event, 'message.complete')) {
    const index = inFlightIndex(state.messages)
    const finalText = event.payload.text || (index !== undefined ? state.messages[index].text : '')
    if (index === undefined) {
      // Implicit start: a complete arrived with no prior message.start/delta.
      return {
        messages: [
          ...state.messages,
          { role: 'assistant', text: finalText, status: event.payload.status }
        ],
        streaming: false
      }
    }
    const messages = [...state.messages]
    messages[index] = { role: 'assistant', text: finalText, status: event.payload.status }
    return { messages, streaming: false }
  }

  if (isGatewayEventOfType(event, 'error')) {
    const index = inFlightIndex(state.messages)
    if (index === undefined) {
      return {
        messages: [
          ...state.messages,
          { role: 'assistant', text: event.payload.message, status: 'error' }
        ],
        streaming: false
      }
    }
    const messages = [...state.messages]
    const current = messages[index]
    messages[index] = { ...current, text: current.text || event.payload.message, status: 'error' }
    return { messages, streaming: false }
  }

  // 'thinking.delta' / 'status.update' / 'gateway.ready' / anything unknown
  // are ignored for 0.11 — kept minimal per the task brief.
  return state
}
