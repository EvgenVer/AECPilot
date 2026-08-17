import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SpeechStreamEvent } from '../../../shared/ipc'
import { createSpeechStreamSocket, SPEECH_STREAM_IPC_URL } from './speech-stream-socket'

/**
 * Task 3.7a. This object stands where the donor's raw socket construction was,
 * so the contract under test is THEIRS: what their player does with a real
 * socket has to work here unchanged. Hence the odd-looking cases — a frame sent
 * before the socket opens, a byte chunk that is a view into a larger buffer, an
 * error that must arrive as an event instead of a throw.
 *
 * `.test.tsx` because that is how a file asks for jsdom here (vitest.config.ts).
 */

const listeners = new Set<(event: SpeechStreamEvent) => void>()
const openSpeechStream = vi.fn()
const sendSpeechFrame = vi.fn()
const closeSpeechStream = vi.fn()

function emit(event: SpeechStreamEvent): void {
  for (const listener of [...listeners]) listener(event)
}

beforeEach(() => {
  listeners.clear()
  openSpeechStream.mockReset().mockResolvedValue({ ok: true })
  sendSpeechFrame.mockReset().mockResolvedValue({ ok: true })
  closeSpeechStream.mockReset().mockResolvedValue(undefined)

  window.aecpilot = {
    openSpeechStream,
    sendSpeechFrame,
    closeSpeechStream,
    onSpeechStreamEvent: (cb: (event: SpeechStreamEvent) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  } as unknown as typeof window.aecpilot
})

// vitest hands the next file in this worker the same jsdom `window`, so a stub
// left on it becomes someone else's bug (task 3.9 lost an afternoon to exactly
// that).
afterEach(() => {
  listeners.clear()
  delete (window as { aecpilot?: unknown }).aecpilot
})

/** Their `openSpeechStream` attaches handlers only after the constructor
 * returns — so does this, and the id comes back for addressing events. */
function connect(): { socket: WebSocket; id: string; seen: string[] } {
  const socket = createSpeechStreamSocket(SPEECH_STREAM_IPC_URL)
  const id = (socket as unknown as { id: string }).id
  const seen: string[] = []

  socket.onopen = () => seen.push('open')
  socket.onerror = () => seen.push('error')
  socket.onclose = () => seen.push('close')

  return { socket, id, seen }
}

describe('createSpeechStreamSocket', () => {
  test('чужой адрес не принимается — сокет умеет ровно одно назначение', () => {
    expect(() => createSpeechStreamSocket('ws://remote.example/api/audio/speak-stream')).toThrow(
      /SPEC C9/
    )
  })

  test('открытие идёт в main, адрес здесь не строится', async () => {
    const { id } = connect()

    expect(openSpeechStream).toHaveBeenCalledWith(id)
    expect(JSON.stringify(openSpeechStream.mock.calls)).not.toContain('ws://')
  })

  test('кадры, отправленные до открытия, уходят после него и по порядку', async () => {
    const { socket, id, seen } = connect()

    expect(socket.readyState).toBe(WebSocket.CONNECTING)
    socket.send('{"text":"раз"}')
    socket.send('{"text":"два"}')
    expect(sendSpeechFrame).not.toHaveBeenCalled()

    emit({ id, type: 'open' })

    expect(socket.readyState).toBe(WebSocket.OPEN)
    expect(sendSpeechFrame.mock.calls).toEqual([
      [id, '{"text":"раз"}'],
      [id, '{"text":"два"}']
    ])
    expect(seen).toEqual(['open'])

    socket.send('{"done":true}')
    expect(sendSpeechFrame).toHaveBeenLastCalledWith(id, '{"done":true}')
  })

  test('управляющий кадр сервера доезжает строкой', () => {
    const { socket, id } = connect()
    const received: unknown[] = []
    socket.onmessage = (event) => received.push((event as { data: unknown }).data)

    emit({ id, type: 'open' })
    emit({ id, type: 'text', text: '{"type":"start","sample_rate":24000}' })

    expect(received).toEqual(['{"type":"start","sample_rate":24000}'])
  })

  test('звук доезжает ровно теми байтами, что прислали', () => {
    const { socket, id } = connect()
    const received: ArrayBuffer[] = []
    socket.onmessage = (event) => received.push((event as { data: ArrayBuffer }).data)

    emit({ id, type: 'open' })
    // Кусок-вид на середину большего буфера: `.buffer` без копии подсунул бы
    // их планировщику соседние байты как звук.
    const backing = new Uint8Array([9, 9, 1, 2, 3, 4, 9, 9])
    emit({ id, type: 'audio', audio: backing.subarray(2, 6) })

    expect(received).toHaveLength(1)
    expect([...new Uint8Array(received[0])]).toEqual([1, 2, 3, 4])
  })

  test('ошибка приезжает событием, а не исключением — иначе не будет отката', () => {
    const { socket, id, seen } = connect()

    emit({ id, type: 'error' })

    expect(seen).toEqual(['error', 'close'])
    expect(socket.readyState).toBe(WebSocket.CLOSED)
  })

  test('отказ main при открытии — тоже ошибка, а не тишина', async () => {
    openSpeechStream.mockResolvedValue({ ok: false, error: 'речевой шлюз недоступен' })
    const { seen } = connect()

    await vi.waitFor(() => expect(seen).toEqual(['error', 'close']))
  })

  test('закрытие сервером закрывает и эту сторону', () => {
    const { socket, id, seen } = connect()

    emit({ id, type: 'open' })
    emit({ id, type: 'close' })

    expect(seen).toEqual(['open', 'close'])
    expect(socket.readyState).toBe(WebSocket.CLOSED)
  })

  test('close() гасит поток в main и больше ничего не докладывает', () => {
    const { socket, id, seen } = connect()

    emit({ id, type: 'open' })
    socket.close()

    expect(closeSpeechStream).toHaveBeenCalledWith(id)
    expect(socket.readyState).toBe(WebSocket.CLOSED)

    // Их `settle` зовёт close() и продолжает жить; опоздавший кадр не должен
    // будить уже погашенную сессию.
    emit({ id, type: 'text', text: '{"type":"end"}' })
    emit({ id, type: 'close' })
    expect(seen).toEqual(['open'])
  })

  test('события чужого потока игнорируются', () => {
    const { socket, seen } = connect()

    emit({ id: 'speech-чужой', type: 'open' })
    emit({ id: 'speech-чужой', type: 'error' })

    expect(seen).toEqual([])
    expect(socket.readyState).toBe(WebSocket.CONNECTING)
  })
})
