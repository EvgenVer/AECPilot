// Pure unit tests for GatewayClient's event dispatch against fixture frames
// (no network) — every known event type is typed/dispatched correctly, and
// a garbage frame does not crash the client. Also covers request()'s
// happy/error/timeout paths and the reconnect/backoff state machine, all
// driven synchronously via a FakeWebSocket + vitest fake timers (no network,
// no real `serve`).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayClient } from './client'
import { isGatewayEventOfType, type GatewayEvent } from './types'

type Listener = (event: { data: string }) => void

/** Minimal fake WebSocket: no real network, just lets the test push raw
 * message frames into the client via `emit(...)`, capture frames the client
 * sends via `sent`, and drive disconnects via `emitClose()`/`emitError()`. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1

  url: string
  readyState = FakeWebSocket.OPEN
  sent: string[] = []
  private listeners: Record<string, Listener[]> = {}

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, cb: Listener): void {
    ;(this.listeners[type] ??= []).push(cb)
  }

  removeEventListener(type: string, cb: Listener): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== cb)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    // no-op
  }

  emit(data: string): void {
    for (const cb of this.listeners['message'] ?? []) cb({ data })
  }

  emitClose(): void {
    for (const cb of this.listeners['close'] ?? []) cb({ data: '' })
  }

  emitError(): void {
    for (const cb of this.listeners['error'] ?? []) cb({ data: '' })
  }
}

function frame(type: string, payload?: unknown, sessionId?: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'event',
    params: { type, session_id: sessionId, payload }
  })
}

/** Parses the id out of the last frame the fake socket captured via `send`,
 * assuming it's a JSON-RPC request frame (`{jsonrpc, id, method, params}`). */
function lastSentId(socket: FakeWebSocket): number {
  const raw = socket.sent[socket.sent.length - 1]
  return (JSON.parse(raw) as { id: number }).id
}

describe('GatewayClient event parsing (fixture frames, no network)', () => {
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.instances = []
  })

  function makeConnectedClient(): { client: GatewayClient; socket: FakeWebSocket } {
    // @ts-expect-error — fake transport is intentionally not a full WebSocket
    globalThis.WebSocket = FakeWebSocket
    const client = new GatewayClient({ url: 'ws://fixture' })
    void client.connect() // don't await — we drive readiness manually below
    const socket = FakeWebSocket.instances[0]
    return { client, socket }
  }

  it('dispatches gateway.ready and flips state to ready', () => {
    const { client, socket } = makeConnectedClient()
    const states: string[] = []
    client.onStateChange((s) => states.push(s))
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))

    socket.emit(frame('gateway.ready'))

    expect(states).toContain('ready')
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('gateway.ready')
  })

  it('dispatches message.delta with typed payload.text', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('message.delta', { text: 'hello' }, 'sess-1'))

    const delta = events.find((e) => e.type === 'message.delta')
    expect(delta).toBeDefined()
    if (isGatewayEventOfType(delta, 'message.delta')) {
      expect(delta.payload.text).toBe('hello')
    }
  })

  it('dispatches thinking.delta with typed payload.text', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('thinking.delta', { text: 'pondering' }))

    const evt = events.find((e) => e.type === 'thinking.delta')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'thinking.delta')) {
      expect(evt.payload.text).toBe('pondering')
    }
  })

  // Task 1.5.D1: the reasoning stream feeding the chat's collapsible
  // reasoning card. Two separate gateway events (hermes wires them to two
  // different agent callbacks) plus a non-streamed variant.
  it('dispatches reasoning.delta with typed payload.text', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('reasoning.delta', { text: 'weighing options' }))

    const evt = events.find((e) => e.type === 'reasoning.delta')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'reasoning.delta')) {
      expect(evt.payload.text).toBe('weighing options')
    }
  })

  it('dispatches reasoning.available, carrying the optional verbose flag', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('reasoning.available', { text: 'full block', verbose: true }))

    const evt = events.find((e) => e.type === 'reasoning.available')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'reasoning.available')) {
      expect(evt.payload.text).toBe('full block')
      expect(evt.payload.verbose).toBe(true)
    }
  })

  it('keeps reasoning events usable when the optional verbose flag is absent', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('reasoning.delta', { text: 'no flag here' }))

    const evt = events.find((e) => e.type === 'reasoning.delta')
    if (isGatewayEventOfType(evt, 'reasoning.delta')) {
      expect(evt.payload.verbose).toBeUndefined()
      expect(evt.payload.text).toBe('no flag here')
    }
  })

  it('dispatches status.update with kind and text', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('status.update', { kind: 'retry', text: 'retrying...' }))

    const evt = events.find((e) => e.type === 'status.update')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'status.update')) {
      expect(evt.payload.kind).toBe('retry')
      expect(evt.payload.text).toBe('retrying...')
    }
  })

  it('dispatches message.complete with status "complete"', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('message.complete', { text: 'PONG', status: 'complete' }))

    const evt = events.find((e) => e.type === 'message.complete')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'message.complete')) {
      expect(evt.payload.status).toBe('complete')
      expect(evt.payload.text).toBe('PONG')
    }
  })

  it('dispatches message.complete with status "error" (provider error, not a json-rpc error)', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('message.complete', { text: 'HTTP 401: Incorrect API key', status: 'error' }))

    const evt = events.find((e) => e.type === 'message.complete')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'message.complete')) {
      expect(evt.payload.status).toBe('error')
    }
  })

  it('dispatches a top-level "error" event with payload.message', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('error', { message: 'turn dispatcher crashed' }))

    const evt = events.find((e) => e.type === 'error')
    expect(evt).toBeDefined()
    if (isGatewayEventOfType(evt, 'error')) {
      expect(evt.payload.message).toBe('turn dispatcher crashed')
    }
  })

  it('dispatches an unrecognized event type without crashing', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))
    socket.emit(frame('session.info', { foo: 'bar' }))

    const evt = events.find((e) => e.type === 'session.info')
    expect(evt).toBeDefined()
  })

  it('ignores non-JSON garbage frames without crashing or dispatching', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))

    expect(() => socket.emit('not json at all {{{')).not.toThrow()
    expect(() => socket.emit('null')).not.toThrow()
    expect(() => socket.emit('42')).not.toThrow()
    expect(() => socket.emit(JSON.stringify({ jsonrpc: '2.0' }))).not.toThrow()

    // only the gateway.ready frame produced a dispatched event
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('gateway.ready')
  })

  it('ignores a malformed event frame (missing params.type) without crashing', () => {
    const { socket, client } = makeConnectedClient()
    const events: GatewayEvent[] = []
    client.onEvent((e) => events.push(e))
    socket.emit(frame('gateway.ready'))

    expect(() =>
      socket.emit(JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { payload: {} } }))
    ).not.toThrow()

    expect(events).toHaveLength(1)
  })
})

describe('GatewayClient request()', () => {
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.instances = []
  })

  function makeReadyClient(): { client: GatewayClient; socket: FakeWebSocket } {
    // @ts-expect-error — fake transport is intentionally not a full WebSocket
    globalThis.WebSocket = FakeWebSocket
    const client = new GatewayClient({ url: 'ws://fixture' })
    void client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.emit(frame('gateway.ready'))
    return { client, socket }
  }

  it('resolves with the result on a matching response frame', async () => {
    const { client, socket } = makeReadyClient()

    const pending = client.request('session.create', { source: 'test' })
    const id = lastSentId(socket)
    socket.emit(JSON.stringify({ jsonrpc: '2.0', id, result: { session_id: 's1' } }))

    await expect(pending).resolves.toEqual({ session_id: 's1' })
  })

  it('rejects with a message containing the code and message text on error response', async () => {
    const { client, socket } = makeReadyClient()

    const pending = client.request('session.create', { source: 'test' })
    const id = lastSentId(socket)
    socket.emit(JSON.stringify({ jsonrpc: '2.0', id, error: { code: 7, message: 'nope' } }))

    await expect(pending).rejects.toThrow('gateway error 7: nope')
  })

  it('rejects on timeout and clears the pending entry (a late response does not throw)', async () => {
    vi.useFakeTimers()
    try {
      const { client, socket } = makeReadyClient()

      const pending = client.request('session.create', { source: 'test' }, 1000)
      const id = lastSentId(socket)
      const assertion = expect(pending).rejects.toThrow(/timed out/)

      await vi.advanceTimersByTimeAsync(1000)
      await assertion

      // late response after timeout must not throw (pending entry is gone)
      expect(() =>
        socket.emit(JSON.stringify({ jsonrpc: '2.0', id, result: { session_id: 'late' } }))
      ).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects immediately when not ready, and sends no frame', async () => {
    // @ts-expect-error — fake transport is intentionally not a full WebSocket
    globalThis.WebSocket = FakeWebSocket
    const client = new GatewayClient({ url: 'ws://fixture' })
    void client.connect() // state is 'connecting' — gateway.ready not yet emitted
    const socket = FakeWebSocket.instances[0]

    await expect(client.request('session.create', { source: 'test' })).rejects.toThrow(
      /not connected/
    )
    expect(socket.sent).toHaveLength(0)
  })

  it('rejects an in-flight request when the socket disconnects', async () => {
    const { client, socket } = makeReadyClient()

    const pending = client.request('session.create', { source: 'test' })
    socket.emitClose()

    await expect(pending).rejects.toThrow()
  })
})

describe('GatewayClient reconnect/backoff', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.WebSocket = originalWebSocket
    FakeWebSocket.instances = []
  })

  function makeReadyClient(options: { reconnectMaxAttempts?: number } = {}): {
    client: GatewayClient
    socket: FakeWebSocket
  } {
    // @ts-expect-error — fake transport is intentionally not a full WebSocket
    globalThis.WebSocket = FakeWebSocket
    const client = new GatewayClient({ url: 'ws://fixture', ...options })
    void client.connect()
    const socket = FakeWebSocket.instances[0]
    socket.emit(frame('gateway.ready'))
    return { client, socket }
  }

  it('schedules exactly one reconnect when both error and close fire for the same socket', async () => {
    const { socket } = makeReadyClient()

    socket.emitError()
    socket.emitClose()

    expect(FakeWebSocket.instances).toHaveLength(1) // no new socket yet — still waiting on backoff

    await vi.advanceTimersByTimeAsync(500) // default reconnectMinDelayMs floor (single increment)

    expect(FakeWebSocket.instances).toHaveLength(2) // exactly one new socket was created
  })

  it('does not reconnect if the socket errors/closes before gateway.ready', async () => {
    // @ts-expect-error — fake transport is intentionally not a full WebSocket
    globalThis.WebSocket = FakeWebSocket
    const client = new GatewayClient({ url: 'ws://fixture' })
    const connectPromise = client.connect()
    const socket = FakeWebSocket.instances[0]

    socket.emitClose()

    await expect(connectPromise).rejects.toThrow()

    await vi.advanceTimersByTimeAsync(60000)
    expect(FakeWebSocket.instances).toHaveLength(1) // no reconnect attempt scheduled
  })

  it('does not reconnect after a manual close()', async () => {
    const { client, socket } = makeReadyClient()

    client.close()
    socket.emitClose()

    await vi.advanceTimersByTimeAsync(60000)
    expect(FakeWebSocket.instances).toHaveLength(1) // no reconnect attempt scheduled
  })

  it('respects reconnectMaxAttempts and ends in closed state', async () => {
    const { client, socket: firstSocket } = makeReadyClient({ reconnectMaxAttempts: 1 })
    const states: string[] = []
    client.onStateChange((s) => states.push(s))

    // 1st disconnect -> allowed (attempt 0 < max 1), schedules a reconnect
    firstSocket.emitClose()
    await vi.advanceTimersByTimeAsync(500)
    expect(FakeWebSocket.instances).toHaveLength(2)

    // 2nd disconnect (from the reconnect socket, still not re-readied) -> attempt 1 >= max 1, gives up
    const secondSocket = FakeWebSocket.instances[1]
    secondSocket.emitClose()
    await vi.advanceTimersByTimeAsync(60000)

    expect(FakeWebSocket.instances).toHaveLength(2) // no further socket created
    expect(states[states.length - 1]).toBe('closed')
  })

  it('resets backoff to the floor delay after reaching gateway.ready again', async () => {
    const { socket: firstSocket } = makeReadyClient()

    // First disconnect -> reconnect after the floor delay (500ms, attempt 0)
    firstSocket.emitClose()
    await vi.advanceTimersByTimeAsync(500)
    expect(FakeWebSocket.instances).toHaveLength(2)

    const secondSocket = FakeWebSocket.instances[1]
    secondSocket.emit(frame('gateway.ready')) // reconnectAttempts resets to 0 here

    // Second disconnect -> should again use the floor delay (500ms), not an escalated one (1000ms)
    secondSocket.emitClose()
    await vi.advanceTimersByTimeAsync(499)
    expect(FakeWebSocket.instances).toHaveLength(2) // not yet — floor delay hasn't elapsed

    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(3) // floor delay elapsed -> new socket
  })
})
