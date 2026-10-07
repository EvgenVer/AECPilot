import { describe, expect, test } from 'vitest'

import { createSpeechStreamSocket, SPEECH_STREAM_IPC_URL } from './speech-stream-socket'

/**
 * Task 3H.3. The speech stream is gone with all voice (SPEC HX19, owner decision
 * 2026-10-07). The seam their player imports must refuse, not hand back an
 * object that looks like a socket and never says anything.
 */
describe('createSpeechStreamSocket', () => {
  test('отказывает словами на любой адрес — голоса в продукте нет', () => {
    expect(() => createSpeechStreamSocket(SPEECH_STREAM_IPC_URL)).toThrow(/SPEC HX19/)
    expect(() => createSpeechStreamSocket('ws://remote.example/api/audio/speak-stream')).toThrow(
      /SPEC HX19/
    )
  })
})
