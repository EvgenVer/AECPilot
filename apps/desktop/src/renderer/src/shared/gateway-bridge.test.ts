import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GatewayBridge, JsonRpcGatewayError, toDonorState } from './gateway-bridge'
import { createGatewayEventDedupe } from '../donor/app/gateway/gateway-event-dedupe'
import type { AecpilotApi } from '../../../shared/ipc'
import type {
  GatewayConnectionState,
  GatewayEvent,
  GatewayServerRequest
} from '../../../shared/gateway/types'

/** A stand-in for the preload bridge: records RPC/REST calls and lets a test
 * push events and state the way main does. */
function stubApi(state: GatewayConnectionState = 'ready') {
  const rpc = vi.fn(async () => ({ ok: true, value: { ok: true } }))
  const rest = vi.fn(async () => ({ ok: true }))
  const respond = vi.fn(async () => true)
  let emitEvent: ((event: GatewayEvent) => void) | undefined
  let emitState: ((state: GatewayConnectionState) => void) | undefined
  let emitRequest: ((request: GatewayServerRequest) => void) | undefined
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
    },
    onGatewayServerRequest: (cb: (request: GatewayServerRequest) => void) => {
      emitRequest = cb
      return () => unsubscribed.push('requests')
    },
    respondGatewayServerRequest: respond,
    getProviderKeys: vi.fn(async () => ({ encryptionAvailable: true, keys: [] }))
  } as unknown as AecpilotApi

  return {
    api,
    rpc,
    rest,
    respond,
    unsubscribed,
    emitEvent: (event: GatewayEvent) => emitEvent?.(event),
    emitState: (next: GatewayConnectionState) => emitState?.(next),
    emitRequest: (request: GatewayServerRequest) => emitRequest?.(request)
  }
}

const event = (type: string): GatewayEvent =>
  ({ type, payload: { n: 1 } }) as unknown as GatewayEvent

const serverRequest = (method = 'clarify'): GatewayServerRequest => ({
  id: 'srq-0000000000a1',
  method,
  params: { session_id: 's1', question: 'Which file?' },
  replayed: false
})

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

  // D-147 (задача 3G.21): их клиент не «открыт», пока его не набрали
  // (`connect`), а их загрузка набирает его прямо перед усыновлением профиля.
  // Мост, открытый с первого кадра, пускал загрузки списков раньше профиля.
  it('a client built by their code stays idle until connect(), then reports main state', async () => {
    const donorStub = stubApi('ready')
    vi.stubGlobal('window', { aecpilot: donorStub.api })
    try {
      const donor = new GatewayBridge({ requestTimeoutMs: 1000 })
      const seen: string[] = []
      donor.onState((state) => seen.push(state))
      await Promise.resolve()
      donorStub.emitState('ready')
      expect(donor.connectionState).toBe('idle')
      expect(seen.every((state) => state === 'idle')).toBe(true)

      await donor.connect('ws://ignored')
      expect(donor.connectionState).toBe('open')
      expect(seen.at(-1)).toBe('open')

      donorStub.emitState('reconnecting')
      expect(seen.slice(-1)).toEqual(['connecting'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('drops its IPC subscriptions on dispose', () => {
    bridge.dispose()
    expect(stub.unsubscribed.sort()).toEqual(['events', 'requests', 'state'])
  })

  // Вопросы ядра окну (0.21.3, задача 3.B5в): их `onRequest` — тот же контракт,
  // что у их `JsonRpcRequestChannel`, кроме одного: без обработчика — молчание.
  it('hands a server request to the handler with respond/fail bound to its id', () => {
    const seen = vi.fn()
    bridge.onRequest((request) => {
      seen(request.id, request.method, request.params, request.replayed)
      request.respond({ answer: 'the second one' })
    })

    stub.emitRequest(serverRequest())

    expect(seen).toHaveBeenCalledWith(
      'srq-0000000000a1',
      'clarify',
      { session_id: 's1', question: 'Which file?' },
      false
    )
    expect(stub.respond).toHaveBeenCalledWith('srq-0000000000a1', {
      result: { answer: 'the second one' }
    })
  })

  it('fail sends a JSON-RPC error under the same id', () => {
    bridge.onRequest((request) => {
      request.fail(-32601, 'cannot answer that')
    })

    stub.emitRequest(serverRequest('vault.code'))

    expect(stub.respond).toHaveBeenCalledWith('srq-0000000000a1', {
      error: { code: -32601, message: 'cannot answer that' }
    })
  })

  it('first answer wins — a card that answers twice sends once', () => {
    bridge.onRequest((request) => {
      request.respond({ answer: 'a' })
      request.respond({ answer: 'b' })
      request.fail(1, 'late')
    })

    stub.emitRequest(serverRequest())

    expect(stub.respond).toHaveBeenCalledTimes(1)
    expect(stub.respond).toHaveBeenCalledWith('srq-0000000000a1', { result: { answer: 'a' } })
  })

  it('a handler that returns false declines, and the next one is tried', () => {
    const first = vi.fn(() => false)
    const second = vi.fn()
    bridge.onRequest(first)
    bridge.onRequest(second)

    stub.emitRequest(serverRequest())

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stays silent with no handler — another window may be the one to answer', () => {
    stub.emitRequest(serverRequest())
    expect(stub.respond).not.toHaveBeenCalled()
  })

  it('an unsubscribed request handler is not called again', () => {
    const handler = vi.fn()
    const off = bridge.onRequest(handler)
    off()

    stub.emitRequest(serverRequest())

    expect(handler).not.toHaveBeenCalled()
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

/** Ловит отказ вызова типизированно: `request` объявлен `Promise<unknown>`, и
 * `.catch(err => err)` схлопывает объединение обратно в `unknown`. */
async function failureOf(call: Promise<unknown>): Promise<JsonRpcGatewayError | undefined> {
  try {
    await call
    return undefined
  } catch (err) {
    return err as JsonRpcGatewayError
  }
}

// Находка D-37. Их `use-prompt-actions` отличает «сообщение, к которому
// откатываются, съела компакция» от любого другого отказа по `code === 4018` и
// читает `data.segment_ordinal`. Пока отказ ехал через IPC исключением, Electron
// доносил только текст — проверка была ложна ВСЕГДА.
describe('отказ шлюза через границу IPC (находка D-37)', () => {
  it('код и данные JSON-RPC доезжают до рендерера', async () => {
    const stub = stubApi()
    stub.rpc.mockResolvedValue({
      ok: false,
      error: {
        message: 'target user message is no longer in session history',
        code: 4018,
        data: { segment_ordinal: -1 }
      }
    } as never)

    const bridge = new GatewayBridge(stub.api)
    const failure = await failureOf(bridge.request('prompt.submit', { text: 'hi' }))

    expect(failure).toBeInstanceOf(JsonRpcGatewayError)
    expect(failure?.code, 'по нему их код и ветвится').toBe(4018)
    expect(failure?.data).toEqual({ segment_ordinal: -1 })
    expect(failure?.message).toBe('target user message is no longer in session history')
  })

  it('отказ без кода остаётся обычной ошибкой с тем же текстом', async () => {
    const stub = stubApi()
    stub.rpc.mockResolvedValue({
      ok: false,
      error: { message: 'gateway is not connected' }
    } as never)

    const bridge = new GatewayBridge(stub.api)
    const failure = await failureOf(bridge.request('session.list'))

    expect(failure).toBeInstanceOf(JsonRpcGatewayError)
    expect(failure?.code).toBeUndefined()
    expect(failure?.message).toBe('gateway is not connected')
  })

  it('удачный вызов отдаёт значение, а не обёртку итога', async () => {
    const stub = stubApi()
    stub.rpc.mockResolvedValue({ ok: true, value: { sessions: [1, 2] } } as never)

    const bridge = new GatewayBridge(stub.api)

    await expect(bridge.request('session.list')).resolves.toEqual({ sessions: [1, 2] })
  })
})

describe('провайдеры без ключа в выборе модели (D-109)', () => {
  const ENV = {
    GEMINI_API_KEY: { provider: 'gemini', is_password: true, is_set: true },
    OPENROUTER_API_KEY: { provider: 'openrouter', is_password: true, is_set: false }
  }

  it('model.options: у провайдера без ключа в имени «нет ключа»', async () => {
    const stub = stubApi()
    stub.rest.mockResolvedValue(ENV as never)
    stub.rpc.mockResolvedValue({
      ok: true,
      value: {
        providers: [
          { slug: 'gemini', name: 'Gemini' },
          { slug: 'openrouter', name: 'OpenRouter' }
        ]
      }
    } as never)
    const bridge = new GatewayBridge(stub.api)

    const answer = await bridge.request<{ providers: { name: string }[] }>('model.options')
    expect(answer.providers.map((p) => p.name)).toEqual(['Gemini', 'OpenRouter — нет ключа'])
    expect(stub.rest).toHaveBeenCalledWith('/api/env', {})
  })

  it('запись профиля с таким провайдером до ядра не доходит', async () => {
    const stub = stubApi()
    stub.rest.mockResolvedValue(ENV as never)
    const bridge = new GatewayBridge(stub.api)

    await expect(
      bridge.request('profiles.configure', { name: 'smeta', model: 'm', provider: 'openrouter' })
    ).rejects.toThrow(/нет ключа/)
    await expect(
      bridge.request('profiles.create', { name: 'x', model: 'm', provider: 'openrouter' })
    ).rejects.toThrow(/нет ключа/)
    expect(stub.rpc).not.toHaveBeenCalled()
  })

  it('ключ из нашего хранилища (не из .env) снимает пометку и отказ', async () => {
    const stub = stubApi()
    stub.rest.mockResolvedValue(ENV as never)
    ;(stub.api.getProviderKeys as ReturnType<typeof vi.fn>).mockResolvedValue({
      encryptionAvailable: true,
      keys: [{ envVar: 'OPENROUTER_API_KEY', hasKey: true, envOverrides: false }]
    })
    const bridge = new GatewayBridge(stub.api)

    await bridge.request('profiles.configure', { name: 'a', model: 'm', provider: 'openrouter' })
    expect(stub.rpc).toHaveBeenCalledTimes(1)
  })

  it('с ключом и без провайдера запись проходит', async () => {
    const stub = stubApi()
    stub.rest.mockResolvedValue(ENV as never)
    const bridge = new GatewayBridge(stub.api)

    await bridge.request('profiles.configure', { name: 'smeta', model: 'm', provider: 'gemini' })
    await bridge.request('profiles.configure', { name: 'smeta', soul: 'x' })
    expect(stub.rpc).toHaveBeenCalledTimes(2)
  })

  it('ядро не ответило — берётся последний прочитанный каталог', async () => {
    const stub = stubApi()
    stub.rest.mockResolvedValueOnce(ENV as never).mockRejectedValue(new Error('timeout'))
    const bridge = new GatewayBridge(stub.api)

    await expect(
      bridge.request('profiles.configure', { name: 'a', model: 'm', provider: 'openrouter' })
    ).rejects.toThrow(/нет ключа/)
    await expect(
      bridge.request('profiles.configure', { name: 'a', model: 'm', provider: 'openrouter' })
    ).rejects.toThrow(/нет ключа/)
    expect(stub.rpc).not.toHaveBeenCalled()
  })

  it('каталог ключей не прочитался — не помечаем и не мешаем', async () => {
    const stub = stubApi()
    stub.rest.mockRejectedValue(new Error('down'))
    stub.rpc.mockResolvedValue({
      ok: true,
      value: { providers: [{ slug: 'openrouter', name: 'OpenRouter' }] }
    } as never)
    const bridge = new GatewayBridge(stub.api)

    const answer = await bridge.request<{ providers: { name: string }[] }>('model.options')
    expect(answer.providers[0].name).toBe('OpenRouter')
    await bridge.request('profiles.configure', { name: 'a', model: 'm', provider: 'openrouter' })
    expect(stub.rpc).toHaveBeenCalledTimes(2)
  })
})

// D-132: каждый их клиент здесь — псевдоним одного соединения, поэтому кадр
// сессии специалиста доходит до их общего обработчика дважды: от основного
// клиента (метка `connectionId: 'local'`) и от клиента профиля (без метки).
// Их фильтр должен узнать вторую копию — по эпохе, которую ставит главный процесс.
describe('копии одного кадра от двух их клиентов', () => {
  const frame = { type: 'message.delta', session_id: 'с-1', seq: 7, replayEpoch: 'e1' }

  it('с эпохой проходят фильтр донора один раз', () => {
    const dedupe = createGatewayEventDedupe()
    const primary = { ...frame, connectionId: 'local', profile: 'default' }
    const secondary = { ...frame, profile: 'smeta' }
    expect(dedupe.admit(primary as never)).toBe(true)
    expect(dedupe.admit(secondary as never)).toBe(false)
  })

  it('мост отдаёт эпоху их обработчикам как есть', async () => {
    const stub = stubApi()
    const bridge = new GatewayBridge(stub.api)
    const seen: unknown[] = []
    bridge.onAny((event) => seen.push(event))
    stub.emitEvent(frame as GatewayEvent)
    expect(seen).toEqual([frame])
  })
})

describe('D-175: причина отказа ядра с их именем не доходит до окна выбора провайдера', () => {
  const coreText = 'Hermes is not connected to any AI provider yet. Run `hermes model` to pick one.'

  it('снимает текст с их именем, отказ оставляет', async () => {
    const stub = stubApi()
    stub.rpc.mockResolvedValueOnce({ ok: true, value: { ok: false, error: coreText } } as never)
    const bridge = new GatewayBridge(stub.api)
    expect(await bridge.request('setup.runtime_check')).toEqual({ ok: false, error: '' })
  })

  it('прочие причины и прочие методы не трогает', async () => {
    const stub = stubApi()
    const own = { ok: false, error: 'No usable credentials found for gemini.' }
    stub.rpc.mockResolvedValueOnce({ ok: true, value: own } as never)
    stub.rpc.mockResolvedValueOnce({ ok: true, value: { ok: false, error: coreText } } as never)
    const bridge = new GatewayBridge(stub.api)
    expect(await bridge.request('setup.runtime_check')).toEqual(own)
    expect(await bridge.request('setup.status')).toEqual({ ok: false, error: coreText })
  })
})
