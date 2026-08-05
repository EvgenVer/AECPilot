// Pure unit tests for the chat reducer (tasks 0.11, 0.12) — no DOM, no
// React: the reducer is framework-free, so these run directly under
// vitest's node environment (see apps/desktop/vitest.config.ts).

import { describe, expect, it } from 'vitest'
import {
  GENERATING_STALE_MS,
  HANDLED_GATEWAY_EVENTS,
  IGNORED_GATEWAY_EVENTS,
  chatReducer,
  initialChatState,
  isUnknownGatewayEvent,
  transcriptCensus,
  userOrdinalOf,
  type ChatItem,
  type ChatMessage,
  type ChatState
} from './chat-state'
import type { GatewayEvent, HistoryMessage } from '../../../shared/gateway/types'

function ev(event: GatewayEvent): { kind: 'event'; event: GatewayEvent } {
  return { kind: 'event', event }
}

/** Same as `ev`, but supplies the dispatcher timestamp the reasoning block
 * uses for its duration (task 1.5.D1). */
function evAt(
  event: GatewayEvent,
  receivedAt: number
): { kind: 'event'; event: GatewayEvent; receivedAt: number } {
  return { kind: 'event', event, receivedAt }
}

describe('chatReducer', () => {
  // --- task 1.5.D1: the reasoning block -------------------------------
  describe('reasoning block', () => {
    it('collects thinking/reasoning chunks into ONE streaming block', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, { kind: 'user-submit', text: 'go' })
      state = chatReducer(state, ev({ type: 'message.start' }))
      state = chatReducer(state, ev({ type: 'thinking.delta', payload: { text: 'first ' } }))
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'second' } }))

      const blocks = state.items.filter((i) => i.kind === 'reasoning')
      expect(blocks).toHaveLength(1)
      expect(blocks[0]).toMatchObject({
        kind: 'reasoning',
        text: 'first second',
        segments: 1,
        status: 'streaming'
      })
    })

    it('starts a block even with no preceding message.start', () => {
      const state = chatReducer(
        initialChatState,
        ev({ type: 'reasoning.delta', payload: { text: 'cold start' } })
      )
      expect(state.items).toHaveLength(1)
      expect(state.items[0]).toMatchObject({ kind: 'reasoning', text: 'cold start', segments: 1 })
    })

    it('counts a resumed step when reasoning returns after a tool call', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'think A' } }))
      state = chatReducer(
        state,
        ev({
          type: 'tool.start',
          payload: { tool_id: 't1', name: 'read_file', context: 'x' }
        })
      )
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'think B' } }))

      const block = state.items.find((i) => i.kind === 'reasoning')
      expect(block).toMatchObject({ segments: 2, text: 'think A\n\nthink B' })
      // still a single block, the tool card sits after it
      expect(state.items.filter((i) => i.kind === 'reasoning')).toHaveLength(1)
    })

    it('seals the block on message.complete and records the duration', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, evAt({ type: 'message.start' }, 1000))
      state = chatReducer(
        state,
        evAt({ type: 'reasoning.delta', payload: { text: 'mulling' } }, 1000)
      )
      state = chatReducer(
        state,
        evAt({ type: 'message.complete', payload: { text: 'done', status: 'complete' } }, 4000)
      )

      const block = state.items.find((i) => i.kind === 'reasoning')
      expect(block).toMatchObject({ status: 'complete', startedAt: 1000, endedAt: 4000 })
    })

    it('omits timestamps entirely when the dispatcher gives none', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'x' } }))
      state = chatReducer(
        state,
        ev({ type: 'message.complete', payload: { text: '', status: 'complete' } })
      )

      const block = state.items.find((i) => i.kind === 'reasoning')
      expect(block).toMatchObject({ status: 'complete' })
      expect(block).not.toHaveProperty('startedAt')
      expect(block).not.toHaveProperty('endedAt')
    })

    it('a sealed block is not reopened — the next turn gets its own', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'turn one' } }))
      state = chatReducer(
        state,
        ev({ type: 'message.complete', payload: { text: 'a', status: 'complete' } })
      )
      state = chatReducer(state, { kind: 'user-submit', text: 'again' })
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'turn two' } }))

      const blocks = state.items.filter((i) => i.kind === 'reasoning')
      expect(blocks).toHaveLength(2)
      expect(blocks[0]).toMatchObject({ text: 'turn one', status: 'complete' })
      expect(blocks[1]).toMatchObject({ text: 'turn two', status: 'streaming' })
    })

    it('an errored turn also seals its block', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'oops' } }))
      state = chatReducer(state, ev({ type: 'error', payload: { message: 'boom' } }))

      expect(state.items.find((i) => i.kind === 'reasoning')).toMatchObject({ status: 'complete' })
    })

    it('ignores empty reasoning chunks', () => {
      const state = chatReducer(
        initialChatState,
        ev({ type: 'reasoning.delta', payload: { text: '' } })
      )
      expect(state.items).toHaveLength(0)
    })

    it('does not disturb the in-flight assistant bubble', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'message.start' }))
      state = chatReducer(state, ev({ type: 'reasoning.delta', payload: { text: 'hmm' } }))
      state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'answer' } }))
      state = chatReducer(
        state,
        ev({ type: 'message.complete', payload: { text: '', status: 'complete' } })
      )

      const message = state.items.find(
        (i): i is ChatMessage => i.kind === 'message' && i.role === 'assistant'
      )
      expect(message?.text).toBe('answer')
    })
  })

  // --- task 1.5.D1 / D1.9: the hermes parity ledger --------------------
  describe('parity ledger', () => {
    it('every handled event really has a reducer branch', () => {
      // Guards the ledger against drifting from the reducer: each listed
      // event must change state (or at least be recognised) rather than fall
      // through to the ignore branch.
      for (const type of HANDLED_GATEWAY_EVENTS) {
        expect(isUnknownGatewayEvent(type)).toBe(false)
      }
    })

    it('deliberately ignored events do not count as unknown', () => {
      for (const type of IGNORED_GATEWAY_EVENTS) {
        expect(isUnknownGatewayEvent(type)).toBe(false)
      }
    })

    it('flags an event nobody has taught the chat about', () => {
      expect(isUnknownGatewayEvent('notification.show')).toBe(true)
      expect(isUnknownGatewayEvent('something.invented.later')).toBe(true)
    })

    it('the two lists do not overlap', () => {
      const handled = new Set<string>(HANDLED_GATEWAY_EVENTS)
      for (const type of IGNORED_GATEWAY_EVENTS) {
        expect(handled.has(type)).toBe(false)
      }
    })
  })

  // --- task 1.5.D1: blocking interactive requests ----------------------
  describe('interactive requests', () => {
    it('queues a clarify request with its question and choices', () => {
      const state = chatReducer(
        initialChatState,
        ev({
          type: 'clarify.request',
          payload: { request_id: 'r1', question: 'Какая категория?', choices: ['I', 'II'] }
        })
      )
      expect(state.interactive).toEqual([
        { kind: 'clarify', requestId: 'r1', question: 'Какая категория?', choices: ['I', 'II'] }
      ])
    })

    it('queues secret and sudo requests', () => {
      let state: ChatState = initialChatState
      state = chatReducer(
        state,
        ev({
          type: 'secret.request',
          payload: { request_id: 'r2', prompt: 'API token', env_var: 'JIRA_TOKEN' }
        })
      )
      state = chatReducer(state, ev({ type: 'sudo.request', payload: { request_id: 'r3' } }))

      expect(state.interactive).toEqual([
        { kind: 'secret', requestId: 'r2', prompt: 'API token', envVar: 'JIRA_TOKEN' },
        { kind: 'sudo', requestId: 'r3' }
      ])
    })

    it('drops a duplicate of a request already queued', () => {
      let state: ChatState = initialChatState
      const evt = ev({
        type: 'clarify.request',
        payload: { request_id: 'r1', question: 'q', choices: [] }
      })
      state = chatReducer(state, evt)
      state = chatReducer(state, evt)
      expect(state.interactive).toHaveLength(1)
    })

    it('ignores a request with no usable id — it could never be answered', () => {
      let state: ChatState = initialChatState
      state = chatReducer(
        state,
        ev({ type: 'clarify.request', payload: { request_id: '', question: 'q' } })
      )
      state = chatReducer(
        state,
        ev({
          type: 'sudo.request',
          payload: {} as unknown as { request_id: string }
        })
      )
      expect(state.interactive).toEqual([])
    })

    it('tolerates missing optional fields', () => {
      const state = chatReducer(
        initialChatState,
        ev({ type: 'clarify.request', payload: { request_id: 'r1' } })
      )
      expect(state.interactive).toEqual([
        { kind: 'clarify', requestId: 'r1', question: '', choices: [] }
      ])
    })

    it('resolves a request by id, leaving the others queued', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'sudo.request', payload: { request_id: 'a' } }))
      state = chatReducer(state, ev({ type: 'sudo.request', payload: { request_id: 'b' } }))
      state = chatReducer(state, { kind: 'interactive-resolved', requestId: 'a' })

      expect(state.interactive).toEqual([{ kind: 'sudo', requestId: 'b' }])
    })

    it('resolving an unknown id is a no-op that does not churn state', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'sudo.request', payload: { request_id: 'a' } }))
      const before = state
      state = chatReducer(state, { kind: 'interactive-resolved', requestId: 'nope' })
      expect(state).toBe(before)
    })

    it('a session switch clears outstanding requests', () => {
      let state: ChatState = initialChatState
      state = chatReducer(state, ev({ type: 'clarify.request', payload: { request_id: 'r1' } }))
      state = chatReducer(state, { kind: 'session-loaded', messages: [] })
      expect(state.interactive).toEqual([])
    })
  })

  it('appends a user message on user-submit', () => {
    const state = chatReducer(initialChatState, { kind: 'user-submit', text: 'hello' })

    expect(state.items).toEqual([{ kind: 'message', id: 0, role: 'user', text: 'hello' }])
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
      { kind: 'message', id: 0, role: 'user', text: 'hi' },
      { kind: 'message', id: 1, role: 'assistant', text: 'Hello!', status: 'complete' }
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
      { kind: 'message', id: 0, role: 'assistant', text: 'the full final text', status: 'complete' }
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
      { kind: 'message', id: 0, role: 'assistant', text: 'boom', status: 'error' }
    ])
    expect(state.streaming).toBe(false)
  })

  it('a message.delta with no preceding message.start still produces an assistant message (implicit start)', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'message.delta', payload: { text: 'surprise' } })
    )

    expect(state.items).toEqual([
      { kind: 'message', id: 0, role: 'assistant', text: 'surprise', status: 'streaming' }
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

  // Superseded by task 1.5.D1: `thinking.delta` used to be ignored (0.11) and
  // now feeds the reasoning block — see the "reasoning block" suite above.
  // `status.update` is now read for two of its kinds only (task 1.6.B5.14);
  // every other kind still changes nothing, which is what this pins.
  it('status.update of an unrelated kind is ignored (state unchanged)', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    const before = state

    state = chatReducer(
      state,
      ev({ type: 'status.update', payload: { kind: 'retry', text: 'retrying' } })
    )
    expect(state).toEqual(before)
  })

  it('message.complete with no in-flight message still produces an assistant message (implicit start)', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'message.complete', payload: { text: 'answer', status: 'complete' } })
    )

    expect(state.items).toEqual([
      { kind: 'message', id: 0, role: 'assistant', text: 'answer', status: 'complete' }
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
      { kind: 'message', id: 0, role: 'assistant', text: 'Found it.', status: 'complete' }
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

  it('unknown tool.* types are a no-op', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'tool.start', payload: { tool_id: 't1', name: 'tool_a', context: 'starting' } })
    )
    const beforeUnknown = state
    state = chatReducer(state, ev({ type: 'tool.mystery', payload: { tool_id: 't1' } }))
    expect(state).toEqual(beforeUnknown)
  })

  // --- task 1.6.B6.9: the phase before the call exists -------------------
  // Their payload is `{name}` and nothing else (`server.py::_agent_cbs`) — no tool
  // id, no text. The tests below pin exactly that; an earlier test in this
  // file asserted a `{tool_id, text}` payload the gateway never sends, and was
  // rewritten rather than kept passing against a fiction.
  describe('tool.generating', () => {
    it('raises a card in the generating phase, not a running one', () => {
      const state = chatReducer(
        initialChatState,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1000)
      )

      expect(state.items).toHaveLength(1)
      expect(state.items[0]).toMatchObject({
        kind: 'tool',
        name: 'read_file',
        status: 'generating',
        generatingSince: 1000
      })
    })

    it('does not raise a second card while the same call is still being written', () => {
      let state = chatReducer(
        initialChatState,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1000)
      )
      state = chatReducer(
        state,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1200)
      )

      expect(state.items).toHaveLength(1)
    })

    it('promotes the placeholder in place when tool.start arrives for the same name', () => {
      let state = chatReducer(
        initialChatState,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1000)
      )
      state = chatReducer(
        state,
        evAt(
          {
            type: 'tool.start',
            payload: { tool_id: 't1', name: 'read_file', context: 'читаю README' }
          },
          1500
        )
      )

      // One card, now a real one — matched by NAME, because tool.generating
      // never carried an id to match by.
      expect(state.items).toHaveLength(1)
      expect(state.items[0]).toMatchObject({
        kind: 'tool',
        toolId: 't1',
        name: 'read_file',
        context: 'читаю README',
        status: 'running'
      })
      expect((state.items[0] as { generatingSince?: number }).generatingSince).toBeUndefined()
    })

    it('leaves a placeholder alone when a different tool starts', () => {
      let state = chatReducer(
        initialChatState,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1000)
      )
      state = chatReducer(
        state,
        evAt(
          { type: 'tool.start', payload: { tool_id: 't1', name: 'run_shell', context: 'ls' } },
          1500
        )
      )

      expect(state.items).toHaveLength(2)
      expect(state.items.map((item) => (item as { status: string }).status).sort()).toEqual([
        'generating',
        'running'
      ])
    })

    // The model can abandon a call mid-argument and answer in text instead —
    // then tool.start never comes and the card must not hang in «готовит».
    it('sweeps a placeholder that never became a call', () => {
      let state = chatReducer(
        initialChatState,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1000)
      )
      state = chatReducer(
        state,
        evAt({ type: 'message.delta', payload: { text: 'ещё думаю' } }, 1000 + 5_000)
      )
      expect(state.items.some((item) => item.kind === 'tool')).toBe(true)

      state = chatReducer(
        state,
        evAt({ type: 'message.delta', payload: { text: ' и ещё' } }, 1000 + GENERATING_STALE_MS + 1)
      )
      expect(state.items.some((item) => item.kind === 'tool')).toBe(false)
    })

    it('drops a standing placeholder when the turn ends', () => {
      let state = chatReducer(
        initialChatState,
        evAt({ type: 'tool.generating', payload: { name: 'read_file' } }, 1000)
      )
      state = chatReducer(
        state,
        evAt({ type: 'message.complete', payload: { text: 'готово', status: 'complete' } }, 1100)
      )

      expect(state.items.some((item) => item.kind === 'tool')).toBe(false)
      expect(state.items.some((item) => item.kind === 'message')).toBe(true)
    })

    it('ignores a payload without a name', () => {
      const before = initialChatState
      expect(chatReducer(before, ev({ type: 'tool.generating', payload: {} }))).toBe(before)
      expect(chatReducer(before, ev({ type: 'tool.generating', payload: { name: '' } }))).toBe(
        before
      )
    })
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

  // --- task 1.6.12: a finished turn drops what nobody waits on any more ---

  it('message.complete drops a pending approval (it expired core-side, nothing waits on it)', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'cmd', description: 'd', pattern_keys: [], allow_permanent: false }
      })
    )
    expect(state.approvals).toHaveLength(1)

    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'done', status: 'complete' } })
    )

    expect(state.approvals).toEqual([])
  })

  it('message.complete drops a pending interactive request', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(
      state,
      ev({ type: 'clarify.request', payload: { request_id: 'r1', question: 'q', choices: [] } })
    )
    expect(state.interactive).toHaveLength(1)

    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'done', status: 'complete' } })
    )

    expect(state.interactive).toEqual([])
  })

  it('an errored turn drops pending approvals and interactive requests too', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(
      state,
      ev({
        type: 'approval.request',
        payload: { command: 'cmd', description: 'd', pattern_keys: [], allow_permanent: false }
      })
    )
    state = chatReducer(state, ev({ type: 'sudo.request', payload: { request_id: 'sudo-1' } }))

    state = chatReducer(state, ev({ type: 'error', payload: { message: 'boom' } }))

    expect(state.approvals).toEqual([])
    expect(state.interactive).toEqual([])
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
      { kind: 'message', id: 0, role: 'user', text: 'hi' },
      { kind: 'message', id: 1, role: 'assistant', text: 'hello there', status: 'complete' },
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

    expect(state.items).toEqual([{ kind: 'message', id: 0, role: 'user', text: 'kept' }])
  })

  it('session-loaded tolerates missing text/name/context fields without crashing', () => {
    const messages: HistoryMessage[] = [{ role: 'user' }, { role: 'assistant' }, { role: 'tool' }]

    const state = chatReducer(initialChatState, { kind: 'session-loaded', messages })

    expect(state.items).toEqual([
      { kind: 'message', id: 0, role: 'user', text: '' },
      { kind: 'message', id: 1, role: 'assistant', text: '', status: 'complete' },
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

  // --- task 1.0: stable/monotonic ChatMessage.id (nit from 0.12/0.14 review) ---

  it('ChatMessage ids are monotonic across a user turn followed by an assistant turn', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, { kind: 'user-submit', text: 'q1' })
    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'a1', status: 'complete' } })
    )
    state = chatReducer(state, { kind: 'user-submit', text: 'q2' })

    const ids = state.items
      .filter((item): item is ChatMessage => item.kind === 'message')
      .map((item) => item.id)
    expect(ids).toEqual([0, 1, 2])
  })

  it('a ChatMessage id is stable when a tool card is inserted before it, shifting its array index', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'message.start' })) // assistant message id 0, index 0
    state = chatReducer(
      state,
      ev({
        type: 'tool.start',
        payload: { tool_id: 't1', name: 'search_files', context: 'looking' }
      })
    ) // tool card inserted before the empty streaming message -> message now at index 1

    const beforeDelta = state.items.find((item): item is ChatMessage => item.kind === 'message')
    expect(beforeDelta?.id).toBe(0)
    expect(state.items.findIndex((item) => item.kind === 'message')).toBe(1)

    state = chatReducer(state, ev({ type: 'message.delta', payload: { text: 'hi' } }))
    const afterDelta = state.items.find((item): item is ChatMessage => item.kind === 'message')
    expect(afterDelta?.id).toBe(0)
  })

  it('session-loaded assigns fresh sequential ids starting at 0, independent of prior state.nextId', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, { kind: 'user-submit', text: 'a' })
    state = chatReducer(state, { kind: 'user-submit', text: 'b' })
    expect(state.nextId).toBe(2)

    state = chatReducer(state, {
      kind: 'session-loaded',
      messages: [
        { role: 'user', text: 'x' },
        { role: 'assistant', text: 'y' }
      ]
    })

    expect(state.items).toEqual([
      { kind: 'message', id: 0, role: 'user', text: 'x' },
      { kind: 'message', id: 1, role: 'assistant', text: 'y', status: 'complete' }
    ])
    expect(state.nextId).toBe(2)
  })
})

// Task 1.6.9 — the runtime the picker displays. It must come from the gateway,
// not from what was clicked.
describe('session runtime', () => {
  it('adopts the model/effort/fast the gateway reports', () => {
    const state = chatReducer(
      initialChatState,
      ev({
        type: 'session.info',
        payload: { model: 'opus', provider: 'anthropic', reasoning_effort: 'high', fast: true }
      })
    )
    expect(state.runtime).toEqual({
      model: 'opus',
      provider: 'anthropic',
      reasoningEffort: 'high',
      fast: true,
      yolo: false
    })
  })

  // --- task 1.6.B5.21: the YOLO zap reads the same source ----------------
  it('берёт состояние YOLO из session.info, а не из нажатия', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'session.info', payload: { model: 'opus', yolo: true } })
    )
    expect(state.runtime.yolo).toBe(true)
  })

  it('событие без `yolo` не гасит уже включённый обход одобрений', () => {
    let state: ChatState = chatReducer(
      initialChatState,
      ev({ type: 'session.info', payload: { yolo: true } })
    )
    state = chatReducer(state, ev({ type: 'session.info', payload: { model: 'opus' } }))
    expect(state.runtime.yolo).toBe(true)
  })

  it('до первого session.info живой сессии для молнии нет', () => {
    // Молния опирается именно на это: без живой сессии их обработчик
    // переключил бы `HERMES_YOLO_MODE` всего процесса шлюза.
    expect(initialChatState.runtimeKnown).toBe(false)
    const state = chatReducer(initialChatState, ev({ type: 'session.info', payload: {} }))
    expect(state.runtimeKnown).toBe(true)
  })

  it('переключение сессии снова делает состояние неизвестным', () => {
    const state = chatReducer(
      chatReducer(initialChatState, ev({ type: 'session.info', payload: { yolo: true } })),
      { kind: 'session-loaded', messages: [] }
    )
    expect(state.runtimeKnown).toBe(false)
    expect(state.runtime.yolo).toBe(false)
  })

  it('keeps fields a later event does not repeat', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'session.info', payload: { model: 'opus', reasoning_effort: 'high' } })
    )
    state = chatReducer(state, ev({ type: 'session.info', payload: { fast: true } }))
    expect(state.runtime).toMatchObject({ model: 'opus', reasoningEffort: 'high', fast: true })
  })

  it('keeps "thinking off" distinct from "provider default"', () => {
    // Their own comment records why: reporting '' for "off" once made a
    // desktop wipe the user's explicit choice.
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'session.info', payload: { reasoning_effort: 'none' } }))
    expect(state.runtime.reasoningEffort).toBe('none')
    state = chatReducer(state, ev({ type: 'session.info', payload: { reasoning_effort: '' } }))
    expect(state.runtime.reasoningEffort).toBe('')
  })

  it('does not put anything in the transcript', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'session.info', payload: { model: 'opus' } })
    )
    expect(state.items).toHaveLength(0)
  })
})

// Task 1.6.A1 — delegated child agents. Five events reach the parent session,
// not six: the child's own reply tokens (`subagent.text`) are deliberately not
// emitted here, so the card is the ONLY window into that work.
describe('subagent cards', () => {
  it('keeps one card per child and updates it in place', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({
        type: 'subagent.start',
        payload: { subagent_id: 'a', goal: 'найти утечку', model: 'opus' }
      })
    )
    state = chatReducer(
      state,
      ev({ type: 'subagent.thinking', payload: { subagent_id: 'a', text: 'смотрю логи' } })
    )

    const cards = state.items.filter((i) => i.kind === 'subagent')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 'a',
      goal: 'найти утечку',
      model: 'opus',
      activity: 'смотрю логи',
      status: 'running',
      toolCount: 0
    })
  })

  it('counts the child tool calls and does not blank fields a later event omits', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'subagent.start', payload: { subagent_id: 'a', goal: 'цель', model: 'opus' } })
    )
    state = chatReducer(state, ev({ type: 'subagent.tool', payload: { subagent_id: 'a' } }))
    state = chatReducer(state, ev({ type: 'subagent.tool', payload: { subagent_id: 'a' } }))

    expect(state.items[0]).toMatchObject({ toolCount: 2, goal: 'цель', model: 'opus' })
  })

  it('closes the card on complete and on interrupt', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'subagent.start', payload: { subagent_id: 'a' } }))
    state = chatReducer(
      state,
      ev({
        type: 'subagent.complete',
        payload: { subagent_id: 'a', summary: 'нашёл', duration_seconds: 4.2 }
      })
    )
    expect(state.items[0]).toMatchObject({ status: 'complete', summary: 'нашёл', durationS: 4.2 })

    state = chatReducer(state, ev({ type: 'subagent.start', payload: { subagent_id: 'b' } }))
    state = chatReducer(state, ev({ type: 'subagent.interrupt', payload: { subagent_id: 'b' } }))
    expect(state.items[1]).toMatchObject({ id: 'b', status: 'interrupted' })
  })

  it('does not collapse two identity-less children of one turn into one card', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'subagent.start', payload: { goal: 'первая' } }))
    state = chatReducer(state, ev({ type: 'subagent.start', payload: { goal: 'вторая' } }))
    expect(state.items.filter((i) => i.kind === 'subagent')).toHaveLength(2)
  })
})

// Task 1.6.A2 — one Mixture-of-Agents card per turn.
describe('MoA card', () => {
  it('collects the consulted models into one card, without repeats', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'moa.reference', payload: { model: 'opus', count: 3 } }))
    state = chatReducer(state, ev({ type: 'moa.reference', payload: { model: 'sonnet' } }))
    state = chatReducer(state, ev({ type: 'moa.reference', payload: { model: 'opus' } }))

    const cards = state.items.filter((i) => i.kind === 'moa')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      models: ['opus', 'sonnet'],
      expected: 3,
      status: 'consulting'
    })
  })

  it('switches to aggregating and remembers who merges the answers', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'moa.reference', payload: { model: 'opus' } }))
    state = chatReducer(state, ev({ type: 'moa.aggregating', payload: { aggregator: 'opus' } }))

    expect(state.items[0]).toMatchObject({
      status: 'aggregating',
      aggregator: 'opus',
      models: ['opus']
    })
  })

  it('starts a card even when aggregating is the first signal of the turn', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'moa.aggregating', payload: { aggregator: 'opus' } })
    )
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({ kind: 'moa', status: 'aggregating', models: [] })
  })
})

// Task 1.6.2 — the census that instruments the "карточки хода пропадают"
// defect. Trivial arithmetic, but it is the thing the diagnosis leans on, so
// it gets pinned: it must count what is there and nothing else.
describe('transcriptCensus', () => {
  it('считает элементы каждого вида и не путает их', () => {
    const items: ChatItem[] = [
      { kind: 'message', id: 0, role: 'user', text: 'привет' },
      { kind: 'reasoning', id: 1, text: 'думаю', segments: 1, status: 'complete' },
      { kind: 'tool', toolId: 't1', name: 'read_file', context: '', status: 'complete' },
      { kind: 'tool', toolId: 't2', name: 'grep', context: '', status: 'running' },
      { kind: 'message', id: 2, role: 'assistant', text: 'ответ', status: 'complete' }
    ]
    expect(transcriptCensus(items)).toEqual({
      messages: 2,
      tools: 2,
      reasoning: 1,
      subagents: 0,
      moa: 0
    })
  })

  it('на пустой ленте даёт нули, а не undefined', () => {
    expect(transcriptCensus([])).toEqual({
      messages: 0,
      tools: 0,
      reasoning: 0,
      subagents: 0,
      moa: 0
    })
  })
})

describe('review.summary (задача 1.6.B3.12)', () => {
  it('добавляет в ленту постоянное системное сообщение', () => {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({
        type: 'review.summary',
        payload: { text: '💾 Self-improvement review: saved skill dwg' }
      })
    )
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({
      kind: 'notice',
      text: '💾 Self-improvement review: saved skill dwg'
    })
  })

  // Это единственное уведомление о том, что агент изменил САМ СЕБЯ; тост
  // истёк бы, и узнать, чему он научился пять минут назад, было бы негде.
  it('сообщение не исчезает после конца хода', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, { kind: 'user-submit', text: 'go' })
    state = chatReducer(state, ev({ type: 'message.start' }))
    state = chatReducer(state, ev({ type: 'review.summary', payload: { text: 'сохранил память' } }))
    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'готово', status: 'complete' } })
    )
    expect(state.items.some((item) => item.kind === 'notice')).toBe(true)
  })

  it('пустой текст игнорируется — пустая плашка хуже отсутствия плашки', () => {
    let state: ChatState = initialChatState
    state = chatReducer(state, ev({ type: 'review.summary', payload: { text: '   ' } }))
    state = chatReducer(state, ev({ type: 'review.summary', payload: {} }))
    expect(state.items).toEqual([])
  })

  it('событие больше не считается неизвестным', () => {
    expect(isUnknownGatewayEvent('review.summary')).toBe(false)
  })
})

describe('secret.expire / sudo.expire (ядро 0.19.0)', () => {
  function withTwoRequests(): ChatState {
    let state: ChatState = initialChatState
    state = chatReducer(
      state,
      ev({ type: 'secret.request', payload: { request_id: 'r1', env_var: 'TOKEN' } })
    )
    state = chatReducer(state, ev({ type: 'sudo.request', payload: { request_id: 'r2' } }))
    return state
  }

  it('снимает именно ту карточку, чей запрос истёк', () => {
    const state = chatReducer(
      withTwoRequests(),
      ev({ type: 'secret.expire', payload: { request_id: 'r1' } })
    )
    expect(state.interactive.map((r) => r.requestId)).toEqual(['r2'])
  })

  // Вторая карточка могла прийти, пока ждала первая; чистка очереди целиком
  // убрала бы с экрана живой запрос, на котором агент всё ещё стоит.
  it('не трогает соседей и не чистит очередь целиком', () => {
    const state = chatReducer(
      withTwoRequests(),
      ev({ type: 'sudo.expire', payload: { request_id: 'r2' } })
    )
    expect(state.interactive).toHaveLength(1)
    expect(state.interactive[0].kind).toBe('secret')
  })

  it('истечение чужого вида не снимает карточку с тем же id', () => {
    const state = chatReducer(
      withTwoRequests(),
      ev({ type: 'sudo.expire', payload: { request_id: 'r1' } })
    )
    expect(state.interactive).toHaveLength(2)
  })

  it('истечение неизвестного id не вызывает перерисовку', () => {
    const before = withTwoRequests()
    const after = chatReducer(before, ev({ type: 'secret.expire', payload: { request_id: 'нет' } }))
    expect(after).toBe(before)
  })

  it('событие без id игнорируется', () => {
    const before = withTwoRequests()
    expect(chatReducer(before, ev({ type: 'secret.expire', payload: {} }))).toBe(before)
  })

  it('оба события больше не считаются неизвестными', () => {
    expect(isUnknownGatewayEvent('secret.expire')).toBe(false)
    expect(isUnknownGatewayEvent('sudo.expire')).toBe(false)
  })

  it('события 0.19.0, которые мы намеренно игнорируем, не шумят', () => {
    for (const type of ['message.interim', 'reaction', 'tool.output_risk']) {
      expect(isUnknownGatewayEvent(type)).toBe(false)
    }
  })
})

// --- task 1.6.B5.14: the compression indicator ------------------------
describe('индикатор сжатия контекста', () => {
  it('ручное сжатие зажигает индикатор', () => {
    const state = chatReducer(
      initialChatState,
      ev({ type: 'status.update', payload: { kind: 'compressing', text: '⠋ compressing 40…' } })
    )
    expect(state.compacting).toBe(true)
  })

  it('автоматическая компакция мид-хода тоже зажигает его', () => {
    // Их `_status_update` перетегивает `lifecycle` в `compacting` — это
    // РАЗНЫЙ kind, и задача названа именно по нему.
    const state = chatReducer(
      initialChatState,
      ev({ type: 'status.update', payload: { kind: 'compacting', text: 'Summarizing…' } })
    )
    expect(state.compacting).toBe(true)
  })

  it('их `ready` снимает индикатор', () => {
    let state = chatReducer(
      initialChatState,
      ev({ type: 'status.update', payload: { kind: 'compressing', text: '…' } })
    )
    state = chatReducer(
      state,
      ev({ type: 'status.update', payload: { kind: 'status', text: 'ready' } })
    )
    expect(state.compacting).toBe(false)
  })

  it('конец хода снимает индикатор, даже если `ready` не пришёл', () => {
    // У автоматической компакции закрывающего события нет вовсе — без
    // этого индикатор горел бы до следующего сжатия.
    let state = chatReducer(
      initialChatState,
      ev({ type: 'status.update', payload: { kind: 'compacting', text: '…' } })
    )
    state = chatReducer(
      state,
      ev({ type: 'message.complete', payload: { text: 'готово', status: 'complete' } })
    )
    expect(state.compacting).toBe(false)
  })

  it('kind:"process" по-прежнему не меняет ничего', () => {
    const before = chatReducer(initialChatState, ev({ type: 'message.start' }))
    const after = chatReducer(
      before,
      ev({ type: 'status.update', payload: { kind: 'process', text: 'npm run dev' } })
    )
    expect(after).toBe(before)
  })

  it('повторное сжатие не вызывает лишнюю перерисовку', () => {
    const lit = chatReducer(
      initialChatState,
      ev({ type: 'status.update', payload: { kind: 'compressing', text: '…' } })
    )
    expect(
      chatReducer(lit, ev({ type: 'status.update', payload: { kind: 'compressing', text: '…' } }))
    ).toBe(lit)
  })

  it('событие больше не считается неизвестным', () => {
    expect(isUnknownGatewayEvent('status.update')).toBe(false)
  })
})

// --- task 1.6.B5.15: undoing a turn -----------------------------------
describe('отмена хода', () => {
  /** Лента одного хода: вопрос → рассуждение → инструмент → ответ.
   * В истории ШЛЮЗА это три записи (user, tool, assistant) — карточки
   * рассуждений у них нет вовсе. */
  function turnItems(): ChatItem[] {
    return [
      { kind: 'message', id: 0, role: 'user', text: 'посчитай' },
      { kind: 'reasoning', id: 1, text: 'думаю', segments: 1, status: 'complete' },
      { kind: 'tool', toolId: 't1', name: 'calc', context: '', status: 'complete' },
      { kind: 'message', id: 2, role: 'assistant', text: '42', status: 'complete' }
    ]
  }

  it('снимает ровно `removed` записей истории, считая карточки инструментов', () => {
    const state = chatReducer(
      { ...initialChatState, items: turnItems(), nextId: 3 },
      { kind: 'turn-undone', removed: 3 }
    )
    // Ушёл весь ход целиком — вместе с карточкой рассуждений, которой в их
    // истории не было, но которая принадлежит снятому ходу.
    expect(state.items).toHaveLength(0)
  })

  it('оставляет предыдущие ходы на месте', () => {
    const items: ChatItem[] = [
      { kind: 'message', id: 0, role: 'user', text: 'первый' },
      { kind: 'message', id: 1, role: 'assistant', text: 'ответ', status: 'complete' },
      ...turnItems()
    ]
    const state = chatReducer(
      { ...initialChatState, items, nextId: 6 },
      { kind: 'turn-undone', removed: 3 }
    )
    expect(state.items.map((item) => item.kind)).toEqual(['message', 'message'])
  })

  it('`removed: 0` не трогает ленту и не вызывает перерисовку', () => {
    const before = { ...initialChatState, items: turnItems(), nextId: 3 }
    expect(chatReducer(before, { kind: 'turn-undone', removed: 0 })).toBe(before)
  })

  it('`removed` больше длины ленты просто очищает её', () => {
    const state = chatReducer(
      { ...initialChatState, items: turnItems(), nextId: 3 },
      { kind: 'turn-undone', removed: 99 }
    )
    expect(state.items).toHaveLength(0)
  })
})

// --- task 1.6.B5.27: an edited message re-runs the turn --------------------
describe('правка своего сообщения', () => {
  function conversation(): ChatItem[] {
    return [
      { kind: 'message', id: 0, role: 'user', text: 'первый' },
      { kind: 'message', id: 1, role: 'assistant', text: 'ответ', status: 'complete' },
      { kind: 'tool', toolId: 't1', name: 'calc', context: '', status: 'complete' },
      { kind: 'message', id: 2, role: 'user', text: 'второй' },
      { kind: 'message', id: 3, role: 'assistant', text: 'ещё ответ', status: 'complete' }
    ]
  }

  it('порядковый номер считается по ходам ПОЛЬЗОВАТЕЛЯ, а не по элементам ленты', () => {
    // В ленте «второй» стоит четвёртым элементом, а для их
    // `truncate_before_user_ordinal` он первый — на этом различии всё и держится.
    expect(userOrdinalOf(conversation(), 2)).toBe(1)
    expect(userOrdinalOf(conversation(), 0)).toBe(0)
  })

  it('ordinal сообщения агента не определён — править можно только своё', () => {
    expect(userOrdinalOf(conversation(), 1)).toBeUndefined()
  })

  it('обрезает ленту до правленого сообщения и ставит новое', () => {
    const state = chatReducer(
      { ...initialChatState, items: conversation(), nextId: 4 },
      { kind: 'user-resubmit', ordinal: 1, text: 'второй, но иначе' }
    )
    expect(state.items.map((item) => (item.kind === 'message' ? item.text : item.kind))).toEqual([
      'первый',
      'ответ',
      'tool',
      'второй, но иначе'
    ])
  })

  it('несуществующий ordinal ленту не трогает', () => {
    // Шлюз к этому моменту уже принял правку; выдуманная обрезка не помогла бы,
    // а следующая загрузка сессии всё равно всё согласует.
    const before = { ...initialChatState, items: conversation(), nextId: 4 }
    expect(chatReducer(before, { kind: 'user-resubmit', ordinal: 9, text: 'x' })).toBe(before)
    expect(chatReducer(before, { kind: 'user-resubmit', ordinal: -1, text: 'x' })).toBe(before)
  })
})

// --- task 1.6.B5.28: the ledger says what it means -------------------------
describe('гигиена «неизвестных» событий', () => {
  it('перечисляет поимённо всё, что молча игнорируется', () => {
    // Список перечислен здесь целиком нарочно: расширить его молча — значит
    // перестать замечать пропущенную возможность после обновления ядра.
    expect([...IGNORED_GATEWAY_EVENTS].sort()).toEqual(
      [
        'gateway.ready',
        'message.interim',
        'pet.generate.progress',
        'pet.hatch.progress',
        'preview.restart.complete',
        'preview.restart.progress',
        'reaction',
        'skin.changed',
        'subagent.text',
        'tool.output_risk',
        'voice.status',
        'voice.transcript'
      ].sort()
    )
  })

  it('мёртвые записи убраны из HANDLED', () => {
    const handled = new Set<string>(HANDLED_GATEWAY_EVENTS)
    // `tool.started` их обработчик намеренно НЕ эмитит (`_on_tool_progress`
    // возвращается раньше), а `subagent.interrupt` — вообще не событие, а имя
    // RPC-метода (`@method("subagent.interrupt")`).
    expect(handled.has('tool.started')).toBe(false)
    expect(handled.has('subagent.interrupt')).toBe(false)
  })

  it('оставшиеся без обработки события остаются видимыми', () => {
    // Батч 6 планирует именно их — записать их в «игнорируем» значило бы
    // спрятать запланированную работу.
    for (const type of ['notification.show', 'notification.clear', 'browser.progress']) {
      expect(isUnknownGatewayEvent(type)).toBe(true)
    }
  })

  it('карточку инструмента всё ещё соберёт и `tool.started`, если он вернётся', () => {
    const state = chatReducer(
      initialChatState,
      ev({
        type: 'tool.started',
        payload: { tool_id: 't1', name: 'calc', context: 'считаю' }
      })
    )
    expect(state.items).toHaveLength(1)
  })
})
