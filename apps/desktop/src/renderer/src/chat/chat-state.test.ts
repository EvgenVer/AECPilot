// Pure unit tests for the chat reducer (tasks 0.11, 0.12) — no DOM, no
// React: the reducer is framework-free, so these run directly under
// vitest's node environment (see apps/desktop/vitest.config.ts).

import { describe, expect, it } from 'vitest'
import { chatReducer, initialChatState, type ChatState } from './chat-state'
import type { GatewayEvent, HistoryMessage } from '../../../shared/gateway/types'

function ev(event: GatewayEvent): { kind: 'event'; event: GatewayEvent } {
  return { kind: 'event', event }
}

describe('chatReducer', () => {
  it('appends a user message on user-submit', () => {
    const state = chatReducer(initialChatState, { kind: 'user-submit', text: 'hello' })

    expect(state.items).toEqual([{ kind: 'message', role: 'user', text: 'hello' }])
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

    expect(state.items).toEqual([
      { kind: 'message', role: 'user', text: 'hi' },
      { kind: 'message', role: 'assistant', text: 'Hello!', status: 'complete' }
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

    expect(state.items).toEqual([
      { kind: 'message', role: 'assistant', text: 'the full final text', status: 'complete' }
    ])
  })

  it('an error event finalizes the in-flight message with an error status', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'oops' } }))
    state = chatReducer(state, ev({ type: 'error', payload: { message: 'boom' } }))

    expect(state.items).toHaveLength(1)
    const [item] = state.items
    expect(item.kind).toBe('message')
    expect(item).toMatchObject({ role: 'assistant', status: 'error' })
    expect(state.streaming).toBe(false)
  })

  it('an error event with no in-flight message still produces an assistant message', () => {
    const state = chatReducer(initialChatState, ev({ type: 'error', payload: { message: 'boom' } }))

    expect(state.items).toEqual([
      { kind: 'message', role: 'assistant', text: 'boom', status: 'error' }
    ])
    expect(state.streaming).toBe(false)
  })

  it('a message.delta with no preceding message.start still produces an assistant message (implicit start)', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'message.delta', payload: { text: 'surprise' } })
    )

    expect(state.items).toEqual([
      { kind: 'message', role: 'assistant', text: 'surprise', status: 'streaming' }
    ])
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

    expect(state.items).toEqual([
      { kind: 'message', role: 'assistant', text: 'answer', status: 'complete' }
    ])
    expect(state.streaming).toBe(false)
  })

  // --- task 0.12: tool-event rendering ---------------------------------

  it('start -> tool.start -> tool.complete -> delta x2 -> complete yields one complete tool card above one assistant message', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(
      state,
      ev({
        type: 'tool.start',
        payload: { tool_id: 't1', name: 'search_files', context: 'Searching files for *.md' }
      })
    )
    state = chatReducer(
      state,
      ev({
        type: 'tool.complete',
        payload: {
          tool_id: 't1',
          name: 'search_files',
          args: { pattern: '*.md' },
          duration_s: 2.3,
          result: { files: ['a.md'] }
        }
      })
    )
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'Found ' } }))
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'it.' } }))
    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: '', status: 'complete' } })
    )

    expect(state.items).toEqual([
      {
        kind: 'tool',
        toolId: 't1',
        name: 'search_files',
        context: 'Searching files for *.md',
        args: { pattern: '*.md' },
        durationS: 2.3,
        result: JSON.stringify({ files: ['a.md'] }, null, 2),
        status: 'complete'
      },
      { kind: 'message', role: 'assistant', text: 'Found it.', status: 'complete' }
    ])
  })

  it('two parallel tools (start A, start B, complete B, complete A) yield two cards matched by id, no duplicates', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'tool.start', payload: { tool_id: 'a', name: 'tool_a', context: 'doing a' } })
    )
    state = chatReducer(
      state,
      ev({ type: 'tool.start', payload: { tool_id: 'b', name: 'tool_b', context: 'doing b' } })
    )
    state = chatReducer(
      state,
      ev({
        type: 'tool.complete',
        payload: { tool_id: 'b', name: 'tool_b', args: {}, duration_s: 1, result: 'result-b' }
      })
    )
    state = chatReducer(
      state,
      ev({
        type: 'tool.complete',
        payload: { tool_id: 'a', name: 'tool_a', args: {}, duration_s: 2, result: 'result-a' }
      })
    )

    expect(state.items).toHaveLength(2)
    expect(state.items).toEqual([
      {
        kind: 'tool',
        toolId: 'a',
        name: 'tool_a',
        context: 'doing a',
        args: {},
        durationS: 2,
        result: 'result-a',
        status: 'complete'
      },
      {
        kind: 'tool',
        toolId: 'b',
        name: 'tool_b',
        context: 'doing b',
        args: {},
        durationS: 1,
        result: 'result-b',
        status: 'complete'
      }
    ])
  })

  it('tool.started after tool.start with the same tool_id does not duplicate the card', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'tool.start', payload: { tool_id: 't1', name: 'tool_a', context: 'first' } })
    )
    state = chatReducer(
      state,
      ev({ type: 'tool.started', payload: { tool_id: 't1', name: 'tool_a', context: 'second' } })
    )

    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toEqual({
      kind: 'tool',
      toolId: 't1',
      name: 'tool_a',
      context: 'first',
      status: 'running'
    })
  })

  it('tool.complete without a prior start creates a card already complete', () => {
    const state = chatReducer(
      initialChatState,
      ev({
        type: 'tool.complete',
        payload: { tool_id: 't1', name: 'tool_a', args: {}, duration_s: 0.5, result: 'done' }
      })
    )

    expect(state.items).toEqual([
      {
        kind: 'tool',
        toolId: 't1',
        name: 'tool_a',
        context: '',
        args: {},
        durationS: 0.5,
        result: 'done',
        status: 'complete'
      }
    ])
  })

  it('tool.complete result normalization: object stringified, JSON-string pretty-printed, plain string kept', () => {
    const objectState = chatReducer(
      initialChatState,
      ev({
        type: 'tool.complete',
        payload: { tool_id: 't1', name: 't', args: {}, duration_s: 1, result: { a: 1 } }
      })
    )
    expect((objectState.items[0] as { result: string }).result).toBe(
      JSON.stringify({ a: 1 }, null, 2)
    )

    const jsonStringState = chatReducer(
      initialChatState,
      ev({
        type: 'tool.complete',
        payload: { tool_id: 't1', name: 't', args: {}, duration_s: 1, result: '{"a":1}' }
      })
    )
    expect((jsonStringState.items[0] as { result: string }).result).toBe(
      JSON.stringify({ a: 1 }, null, 2)
    )

    const plainStringState = chatReducer(
      initialChatState,
      ev({
        type: 'tool.complete',
        payload: { tool_id: 't1', name: 't', args: {}, duration_s: 1, result: 'just text' }
      })
    )
    expect((plainStringState.items[0] as { result: string }).result).toBe('just text')
  })

  it('tool.generating with a text payload updates the card context; unknown tool.* types are a no-op', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'tool.start', payload: { tool_id: 't1', name: 'tool_a', context: 'starting' } })
    )
    state = chatReducer(
      state,
      ev({ type: 'tool.generating', payload: { tool_id: 't1', text: 'still going' } })
    )
    expect(state.items[0]).toMatchObject({ context: 'still going' })

    const beforeUnknown = state
    state = chatReducer(state, ev({ type: 'tool.mystery', payload: { tool_id: 't1' } }))
    expect(state).toEqual(beforeUnknown)
  })

  // --- task 0.13: approvals ---------------------------------------------

  it('approval.request pushes a request with correct field mapping', () => {
    const state = chatReducer(
      initialChatState,
      ev({
        type: 'approval.request',
        payload: {
          command: 'rm -rf build/',
          description: 'Delete the build directory',
          pattern_keys: ['rm'],
          allow_permanent: true
        }
      })
    )

    expect(state.approvals).toEqual([
      {
        command: 'rm -rf build/',
        description: 'Delete the build directory',
        patternKeys: ['rm'],
        allowPermanent: true
      }
    ])
  })

  it('approval.request with missing fields falls back to defaults', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'approval.request', payload: {} as never })
    )

    expect(state.approvals).toEqual([
      { command: '', description: '', patternKeys: [], allowPermanent: false }
    ])
  })

  it('reducer ignores a malformed approval.request payload without crashing', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'approval.request', payload: undefined as never })
    )

    expect(state.approvals).toEqual([
      { command: '', description: '', patternKeys: [], allowPermanent: false }
    ])
  })

  it('two approval.request events queue in FIFO order', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'first', description: 'd1', pattern_keys: [], allow_permanent: false }
      })
    )
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'second', description: 'd2', pattern_keys: [], allow_permanent: false }
      })
    )

    expect(state.approvals.map((a) => a.command)).toEqual(['first', 'second'])
  })

  it('approvals-resolved count:1 drops only the queue head', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'first', description: 'd1', pattern_keys: [], allow_permanent: false }
      })
    )
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'second', description: 'd2', pattern_keys: [], allow_permanent: false }
      })
    )
    state = chatReducer(state, { kind: 'approvals-resolved', count: 1 })

    expect(state.approvals.map((a) => a.command)).toEqual(['second'])
  })

  it('approvals-resolved with a count larger than the queue empties it safely', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'only', description: 'd', pattern_keys: [], allow_permanent: false }
      })
    )
    state = chatReducer(state, { kind: 'approvals-resolved', count: 99 })

    expect(state.approvals).toEqual([])
  })

  it('approvals-resolved on an empty queue is a no-op', () => {
    const state = chatReducer(initialChatState, { kind: 'approvals-resolved', count: 1 })
    expect(state.approvals).toEqual([])
  })

  it('approval.request does not touch items or streaming', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'hi' } }))
    const beforeApproval = state

    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'cmd', description: 'd', pattern_keys: [], allow_permanent: false }
      })
    )

    expect(state.items).toEqual(beforeApproval.items)
    expect(state.streaming).toBe(beforeApproval.streaming)
    expect(state.approvals).toHaveLength(1)
  })

  // --- task 0.14: session-loaded (list/create/switch sessions) ----------

  it('session-loaded maps user/assistant/tool history entries with correct statuses and hist-N toolIds', () => {
    const messages: HistoryMessage[] = [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello there' },
      { role: 'tool', name: 'search_files', context: 'Searching files for *.md' }
    ]

    const state = chatReducer(initialChatState, { kind: 'session-loaded', messages })

    expect(state.items).toEqual([
      { kind: 'message', role: 'user', text: 'hi' },
      { kind: 'message', role: 'assistant', text: 'hello there', status: 'complete' },
      {
        kind: 'tool',
        toolId: 'hist-2',
        name: 'search_files',
        context: 'Searching files for *.md',
        status: 'complete'
      }
    ])
  })

  it('session-loaded skips system and unrecognized roles', () => {
    const messages: HistoryMessage[] = [
      { role: 'user', text: 'kept' },
      { role: 'system', text: 'dropped' },
      { role: 'mystery', text: 'also dropped' }
    ]

    const state = chatReducer(initialChatState, { kind: 'session-loaded', messages })

    expect(state.items).toEqual([{ kind: 'message', role: 'user', text: 'kept' }])
  })

  it('session-loaded tolerates missing text/name/context fields without crashing', () => {
    const messages: HistoryMessage[] = [{ role: 'user' }, { role: 'assistant' }, { role: 'tool' }]

    const state = chatReducer(initialChatState, { kind: 'session-loaded', messages })

    expect(state.items).toEqual([
      { kind: 'message', role: 'user', text: '' },
      { kind: 'message', role: 'assistant', text: '', status: 'complete' },
      { kind: 'tool', toolId: 'hist-2', name: '', context: '', status: 'complete' }
    ])
  })

  it('session-loaded resets a queued approval', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'cmd', description: 'd', pattern_keys: [], allow_permanent: false }
      })
    )
    expect(state.approvals).toHaveLength(1)

    state = chatReducer(state, { kind: 'session-loaded', messages: [{ role: 'user', text: 'hi' }] })

    expect(state.approvals).toEqual([])
  })

  it('session-loaded resets an in-flight streaming turn', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    expect(state.streaming).toBe(true)

    state = chatReducer(state, { kind: 'session-loaded', messages: [] })

    expect(state.streaming).toBe(false)
  })

  it('session-loaded with an empty array empties the transcript', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, { kind: 'user-submit', text: 'hello' })
    expect(state.items).toHaveLength(1)

    state = chatReducer(state, { kind: 'session-loaded', messages: [] })

    expect(state.items).toEqual([])
  })
})
