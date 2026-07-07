// Pure unit tests for the chat reducer (task 0.11) — no DOM, no React: the
// reducer is framework-free, so these run directly under vitest's node
// environment (see apps/desktop/vitest.config.ts).

import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState, type ChatState } from './chat-state'
import type { GatewayEvent } from '../../../shared/gateway/types'

function ev(event: GatewayEvent): { kind: 'event'; event: GatewayEvent } {
  return { kind: 'event', event }
}

describe('chatReducer', () => {
  it('appends a user message on user-submit', () => {
    const state = chatReducer(initialChatState, { kind: 'user-submit', text: 'hello' })

    expect(state.messages).toEqual([{ role: 'user', text: 'hello' }])
    expect(state.streaming).toBe(false)
  })

  it('start -> delta -> delta -> complete yields one assistant message with concatenated text and status complete', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, { kind: 'user-submit', text: 'hi' })
    state = chatReducer(state, ev({ type: 'message.start' }))
    expect(state.streaming).toBe(true)

    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'Hel' } }))
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'lo!' } }))
    // message.complete's payload.text is empty here -> falls back to accumulated deltas
    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: '', status: 'complete' } })
    )

    expect(state.messages).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'Hello!', status: 'complete' }
    ])
    expect(state.streaming).toBe(false)
  })

  it('message.complete with a non-empty payload.text uses it (overrides accumulated deltas)', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'partial' } }))
    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'the full final text', status: 'complete' } })
    )

    expect(state.messages).toEqual([
      { role: 'assistant', text: 'the full final text', status: 'complete' }
    ])
  })

  it('an error event finalizes the in-flight message with an error status', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'oops' } }))
    state = chatReducer(state, ev({ type: 'error', payload: { message: 'boom' } }))

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].role).toBe('assistant')
    expect(state.messages[0].status).toBe('error')
    expect(state.streaming).toBe(false)
  })

  it('an error event with no in-flight message still produces an assistant message', () => {
    const state = chatReducer(initialChatState, ev({ type: 'error', payload: { message: 'boom' } }))

    expect(state.messages).toEqual([{ role: 'assistant', text: 'boom', status: 'error' }])
    expect(state.streaming).toBe(false)
  })

  it('a message.delta with no preceding message.start still produces an assistant message (implicit start)', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'message.delta', payload: { text: 'surprise' } })
    )

    expect(state.messages).toEqual([{ role: 'assistant', text: 'surprise', status: 'streaming' }])
    expect(state.streaming).toBe(true)
  })

  it('streaming flips true on message.start and false on message.complete', () => {
    let state: ChatState = initialChatState
    expect(state.streaming).toBe(false)

    state = chatReducer(state, ev({ type: 'message.start' }))
    expect(state.streaming).toBe(true)

    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'done', status: 'complete' } })
    )
    expect(state.streaming).toBe(false)
  })

  it('streaming flips true on message.start and false on error', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    expect(state.streaming).toBe(true)

    state = chatReducer(state, ev({ type: 'error', payload: { message: 'fail' } }))
    expect(state.streaming).toBe(false)
  })

  it('thinking.delta and status.update are ignored (state unchanged) for 0.11', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    const beforeThinking = state

    state = chatReducer(state, ev({ type: 'thinking.delta', payload: { text: 'pondering' } }))
    expect(state).toEqual(beforeThinking)

    state = chatReducer(
      state,
      ev({ type: 'status.update', payload: { kind: 'retry', text: 'retrying' } })
    )
    expect(state).toEqual(beforeThinking)
  })

  it('message.complete with no in-flight message still produces an assistant message (implicit start)', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'message.complete', payload: { text: 'answer', status: 'complete' } })
    )

    expect(state.messages).toEqual([{ role: 'assistant', text: 'answer', status: 'complete' }])
    expect(state.streaming).toBe(false)
  })
})
