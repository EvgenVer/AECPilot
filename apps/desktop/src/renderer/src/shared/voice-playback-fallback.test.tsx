import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { SpeechStreamEvent } from '../../../shared/ipc'

/**
 * Task 3.7a — the property the whole voice mode hangs on: when the live stream
 * cannot play, the reply is still SPOKEN, over the POST endpoint. It held in
 * neither direction before this task. The streaming branch was entered (the
 * shim's `getConnection` handed it a usable-looking URL), the socket
 * constructor threw, and `playSpeechText` rethrew instead of falling back — so
 * "read replies aloud" and the voice conversation both produced silence.
 *
 * Two ways the stream can decline, both covered here because they are
 * different code paths and only one of them is an error:
 *   • main refuses to open it (backend not up) → their `onerror` → fallback;
 *   • the server answers `{"type":"fallback"}` — the ordinary case on the
 *     default TTS provider, which has no chunked API at all.
 *
 * `.test.tsx` because that is how a file asks for jsdom here (vitest.config.ts)
 * — this one needs `window` and an `<audio>` element, not React.
 */

const { speakText } = vi.hoisted(() => ({ speakText: vi.fn() }))

// The real `@/hermes` is the donor's whole backend client; the POST endpoint is
// the only part of it this path touches. `getApiRequestProfile` is here even
// though the file no longer imports it: without it the pre-fix version of the
// file threw INSIDE its own try/catch and returned null — the very answer an
// earlier version of this test was checking for — so the mock, not the app,
// would have been under test.
vi.mock('@/hermes', () => ({ speakText, getApiRequestProfile: () => null }))

const { playSpeechText, startSpeechStream } = await import('@/lib/voice-playback')
const { installHermesDesktopBridge } = await import('./hermes-desktop-shim')

const listeners = new Set<(event: SpeechStreamEvent) => void>()
const openSpeechStream = vi.fn()
const requestMicrophoneAccess = vi.fn()

function emit(id: string, event: Omit<SpeechStreamEvent, 'id'>): void {
  for (const listener of [...listeners]) listener({ id, ...event } as SpeechStreamEvent)
}

/** The stream id is minted inside the adapter; main learns it from the open
 * call, and so does this test — the same way. */
async function openedStreamId(): Promise<string> {
  await vi.waitFor(() => expect(openSpeechStream).toHaveBeenCalled())

  return openSpeechStream.mock.calls.at(-1)![0] as string
}

beforeEach(() => {
  listeners.clear()
  speakText.mockReset().mockResolvedValue({ data_url: 'data:audio/mpeg;base64,AAAA' })
  openSpeechStream.mockReset().mockResolvedValue({ ok: true })
  requestMicrophoneAccess.mockReset().mockResolvedValue(false)

  window.aecpilot = {
    requestMicrophoneAccess,
    openSpeechStream,
    sendSpeechFrame: vi.fn().mockResolvedValue({ ok: true }),
    closeSpeechStream: vi.fn().mockResolvedValue(undefined),
    onSpeechStreamEvent: (cb: (event: SpeechStreamEvent) => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  } as unknown as typeof window.aecpilot

  // The REAL shim, not a hand-made stand-in: what broke playback was the pair
  // of these two files disagreeing, so a reconstruction of one of them would
  // measure the reconstruction.
  installHermesDesktopBridge()

  // jsdom has no media pipeline: play() is "not implemented". Stand in for it
  // and end the clip immediately, so the test measures which PATH was taken.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLAudioElement
  ) {
    queueMicrotask(() => this.dispatchEvent(new Event('ended')))
    return Promise.resolve()
  })
})

// The jsdom `window` outlives this file: vitest reuses the environment for the
// next test file in the worker, and `installHermesDesktopBridge` + a stubbed
// `window.aecpilot` are exactly the globals other suites reach through. Left
// behind, they turned the donor's messaging screen from "mocked, instant" into
// a component whose promise chain never settles — its first case then timed out
// (found in task 3.9, and only because the failure was in someone else's file).
afterEach(() => {
  vi.restoreAllMocks()
  delete (window as { aecpilot?: unknown }).aecpilot
  delete (window as { hermesDesktop?: unknown }).hermesDesktop
})

describe('речь, когда живой поток не играет', () => {
  test('шлюз не поднялся — реплика всё равно читается, через POST', async () => {
    openSpeechStream.mockResolvedValue({ ok: false, error: 'речевой шлюз недоступен' })

    await expect(
      playSpeechText('Колонна К-1 армируется по узлу 3.', { source: 'read-aloud' })
    ).resolves.toBe(true)

    // С 0.21.5 вторым аргументом едет область владельца (профиль/подключение).
    expect(speakText).toHaveBeenCalledWith(
      'Колонна К-1 армируется по узлу 3.',
      expect.objectContaining({ source: 'read-aloud' })
    )
  })

  test('сервер ответил «потока нет» — реплика читается, через POST', async () => {
    const spoken = playSpeechText('Марка бетона B25.', { source: 'read-aloud' })

    // Ровно то, что отвечает ядро на провайдере по умолчанию: у Edge нет
    // потокового API, и решает это СЕРВЕР, а не мы за него.
    const id = await openedStreamId()
    emit(id, { type: 'open' })
    emit(id, { type: 'text', text: '{"type":"fallback"}' })

    await expect(spoken).resolves.toBe(true)
    // С 0.21.5 вторым аргументом едет область владельца (профиль/подключение).
    expect(speakText).toHaveBeenCalledWith(
      'Марка бетона B25.',
      expect.objectContaining({ source: 'read-aloud' })
    )
  })

  test('разговорный цикл получает сессию и её вердикт «нет потока»', async () => {
    const session = await startSpeechStream({ source: 'voice-conversation' })
    expect(session).not.toBeNull()

    emit(await openedStreamId(), { type: 'error' })

    // Их цикл на этом вердикте зовёт awaitFallbackSpeech и дочитывает ответ
    // целиком — то есть тишины не остаётся и здесь.
    await expect(session?.done).resolves.toBe('fallback')
    expect(speakText).not.toHaveBeenCalled()
  })

  test('микрофон отвечает булевым, а не отказом промиса', async () => {
    // Их диктофон читает ответ как `permitted === false`. Непроброшенный
    // член шима ОТКЛОНЯЕТ промис, а `await` на отклонении — это исключение,
    // а не `false`: кнопка микрофона показывала «не удалось начать запись»
    // и не записывала ничего.
    await expect(window.hermesDesktop.requestMicrophoneAccess()).resolves.toBe(false)
    expect(requestMicrophoneAccess).toHaveBeenCalledTimes(1)
  })
})
