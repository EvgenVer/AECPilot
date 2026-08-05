import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayBridge, toDonorState } from './gateway-bridge'
import type { AecpilotApi } from '../../../shared/ipc'
import type { GatewayConnectionState, GatewayEvent } from '../../../shared/gateway/types'

/** A stand-in for the preload bridge: records RPC/REST calls and lets a test
 * push events and state the way main does. */
function stubApi(state: GatewayConnectionState = 'ready') {
  const rpc = vi.fn(async () => ({ ok: true }))
  const rest = vi.fn(async () => ({ ok: true }))
  let emitEvent: ((event: GatewayEvent) => void) | undefined
  let emitState: ((state: GatewayConnectionState) => void) | undefined
  const unsubscribed: string[] = []

  const api = {
    gatewayRpc: rpc,
    gatewayRest: rest,
    getGatewayState: vi.fn(async () => state),
    onChatEvent: (cb: (event: GatewayEvent) => void) => {
      emitEvent = cb
      return () => unsubscribed.push('events')
    },
    onGatewayState: (cb: (state: GatewayConnectionState) => void) => {
      emitState = cb
      return () => unsubscribed.push('state')
    }
  } as unknown as AecpilotApi

  return {
    api,
    rpc,
    rest,
    unsubscribed,
    emitEvent: (event: GatewayEvent) => emitEvent?.(event),
    emitState: (next: GatewayConnectionState) => emitState?.(next)
  }
}

const event = (type: string): GatewayEvent =>
  ({ type, payload: { n: 1 } }) as unknown as GatewayEvent

describe('GatewayBridge', () => {
  let stub: ReturnType<typeof stubApi>
  let bridge: GatewayBridge

  beforeEach(() => {
    stub = stubApi()
    bridge = new GatewayBridge(stub.api)
  })

  it('sends an RPC call through the IPC bridge, not a socket', async () => {
    await bridge.request('session.list', { limit: 20 })
    expect(stub.rpc).toHaveBeenCalledWith('session.list', { limit: 20 }, undefined)
  })

  it('defaults params to an empty object, as their wrappers assume', async () => {
    await bridge.request('status.get')
    expect(stub.rpc).toHaveBeenCalledWith('status.get', {}, undefined)
  })

  it('passes a per-call timeout through', async () => {
    await bridge.request('prompt.submit', { text: 'hi' }, 1_800_000)
    expect(stub.rpc).toHaveBeenCalledWith('prompt.submit', { text: 'hi' }, 1_800_000)
  })

  it('rejects immediately on an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(bridge.request('session.list', {}, undefined, controller.signal)).rejects.toThrow(
      /Aborted/
    )
    expect(stub.rpc).not.toHaveBeenCalled()
  })

  it('rejects when the signal aborts mid-flight', async () => {
    const controller = new AbortController()
    const pending = bridge.request('session.list', {}, undefined, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow(/Aborted/)
  })

  it('sends a REST call through the IPC bridge', async () => {
    await bridge.rest('/api/profiles', { method: 'POST', body: { name: 'dev' } })
    expect(stub.rest).toHaveBeenCalledWith('/api/profiles', {
      method: 'POST',
      body: { name: 'dev' }
    })
  })

  it('delivers an event to type subscribers and to onAny', () => {
    const typed = vi.fn()
    const any = vi.fn()
    bridge.on('message.delta', typed)
    bridge.onAny(any)

    stub.emitEvent(event('message.delta'))
    stub.emitEvent(event('tool.start'))

    expect(typed).toHaveBeenCalledTimes(1)
    expect(any).toHaveBeenCalledTimes(2)
  })

  it('stops delivering after unsubscribe', () => {
    const handler = vi.fn()
    const off = bridge.on('message.delta', handler)
    off()
    stub.emitEvent(event('message.delta'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('fires a state subscriber immediately and on every change', () => {
    const seen: string[] = []
    bridge.onState((state) => seen.push(state))

    stub.emitState('reconnecting')
    stub.emitState('ready')

    // First entry is the immediate call with what the bridge already knows —
    // beforeEach let the constructor's getGatewayState() land, so 'open'.
    expect(seen).toEqual(['open', 'connecting', 'open'])
  })

  it('hydrates its state from main, since ready can precede this renderer', async () => {
    // A fresh bridge subscribed to synchronously: main is 'ready', but the
    // read is a promise, so the immediate call can only report 'closed'.
    const fresh = stubApi('ready')
    const seen: string[] = []
    new GatewayBridge(fresh.api).onState((state) => seen.push(state))
    expect(seen).toEqual(['closed'])

    await vi.waitFor(() => expect(seen).toEqual(['closed', 'open']))
  })

  it('drops its IPC subscriptions on dispose', () => {
    bridge.dispose()
    expect(stub.unsubscribed.sort()).toEqual(['events', 'state'])
  })

  it('treats connect and close as no-ops — the connection is main’s', async () => {
    await expect(bridge.connect()).resolves.toBeUndefined()
    expect(() => bridge.close()).not.toThrow()
  })
})

describe('toDonorState', () => {
  it('maps our states onto theirs', () => {
    expect(toDonorState('ready')).toBe('open')
    expect(toDonorState('connecting')).toBe('connecting')
    expect(toDonorState('closed')).toBe('closed')
  })

  it('maps reconnecting to connecting, not error', () => {
    // Their components treat 'error' as terminal and stop retrying; ours is
    // mid-backoff and comes back on its own.
    expect(toDonorState('reconnecting')).toBe('connecting')
  })
})
