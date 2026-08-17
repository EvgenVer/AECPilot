import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Task 3.7a — the two runtime facts EDIT [1] in `donor/lib/voice-playback.ts`
 * rests on. Both were BROKEN before this task, and neither is visible by
 * reading that file alone: it looks like the streaming branch simply never
 * runs, while in truth the shim's `getConnection` handed it a usable-looking
 * URL and the app then spoke nothing at all.
 *
 * `.test.tsx` because that is how a file asks for jsdom here (see
 * vitest.config.ts) — this one needs `window` and an `<audio>` element, not
 * React.
 */

const { speakText } = vi.hoisted(() => ({ speakText: vi.fn() }))

// The real `@/hermes` is the donor's whole backend client; the POST endpoint is
// the only part of it this path touches. `getApiRequestProfile` is here even
// though the file no longer imports it: without it the pre-fix version of the
// file threw INSIDE its own try/catch and returned null — the very answer this
// test is checking for — so the mock, not the app, would have been under test.
vi.mock('@/hermes', () => ({ speakText, getApiRequestProfile: () => null }))

const { playSpeechText, startSpeechStream } = await import('@/lib/voice-playback')
const { installHermesDesktopBridge } = await import('./hermes-desktop-shim')

beforeEach(() => {
  // The REAL shim, not a hand-made stand-in: what broke playback was the pair
  // of these two files disagreeing, so a reconstruction of one of them would
  // measure the reconstruction. Without it `window.hermesDesktop` is undefined
  // and the streaming branch is skipped for a reason the app never has.
  installHermesDesktopBridge()

  speakText.mockReset()
  speakText.mockResolvedValue({ data_url: 'data:audio/mpeg;base64,AAAA' })

  // jsdom has no media pipeline: play() is "not implemented". Stand in for it
  // and end the clip immediately, so the test measures which PATH was taken.
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLAudioElement
  ) {
    queueMicrotask(() => this.dispatchEvent(new Event('ended')))
    return Promise.resolve()
  })
})

describe('речь без потокового сокета (SPEC C9)', () => {
  test('реплика читается через POST, а не падает на конструкторе сокета', async () => {
    await expect(
      playSpeechText('Колонна К-1 армируется по узлу 3.', { source: 'read-aloud' })
    ).resolves.toBe(true)

    expect(speakText).toHaveBeenCalledTimes(1)
    expect(speakText).toHaveBeenCalledWith('Колонна К-1 армируется по узлу 3.')
  })

  test('микрофон отвечает булевым, а не отказом промиса', async () => {
    // Их диктофон читает ответ как `permitted === false`. Непроброшенный
    // член шима ОТКЛОНЯЕТ промис, а `await` на отклонении — это исключение,
    // а не `false`: кнопка микрофона показывала «не удалось начать запись»
    // и не записывала ничего.
    const requestMicrophoneAccess = vi.fn().mockResolvedValue(false)
    window.aecpilot = { requestMicrophoneAccess } as unknown as typeof window.aecpilot

    await expect(window.hermesDesktop.requestMicrophoneAccess()).resolves.toBe(false)
    expect(requestMicrophoneAccess).toHaveBeenCalledTimes(1)
  })

  test('живой поток недоступен — и говорит об этом через null, их же ответом', async () => {
    // `null` — это ветка «нет потокового бэкенда» их разговорного цикла: он
    // вызывает awaitFallbackSpeech и дочитывает ответ целиком. Сессия,
    // которая сразу отваливается, привела бы туда же, но лишним мерцанием
    // состояния «готовлю речь».
    await expect(startSpeechStream({ source: 'voice-conversation' })).resolves.toBeNull()
    expect(speakText).not.toHaveBeenCalled()
  })
})
