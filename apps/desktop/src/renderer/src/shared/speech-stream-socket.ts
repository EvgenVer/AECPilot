// A WebSocket-shaped object whose transport is our IPC bridge (task 3.7a).
//
// `donor/lib/voice-playback.ts` schedules PCM through Web Audio and drives the
// session with `onopen` / `onmessage` / `onerror` / `onclose`, `send`, `close`
// and `readyState`. All of that is fine here — what is NOT fine is the one line
// that constructs the socket, because SPEC C9 keeps the gateway's URL and token
// out of the renderer. So the socket is main's, and this stands where theirs
// was: same shape, same lifecycle, no address and no credential on this side.
//
// It is the whole of edit [1] in that file. Anything their player does with a
// real socket must work against this object unchanged, so the rules below are
// theirs, not ours:
//   • handlers are attached AFTER the constructor returns, so no event may fire
//     synchronously — every one arrives over IPC, i.e. asynchronously anyway;
//   • frames sent while still CONNECTING are queued (their `send` queues too,
//     and flushes on `onopen` — both queues drain in order);
//   • `readyState` is compared against the GLOBAL `WebSocket.OPEN` /
//     `.CONNECTING` constants, so the numbers here are those numbers.

import type { SpeechStreamEvent } from '../../../shared/ipc'

/** The address their code passes to the constructor. It is a marker, not a
 * destination: main knows where the gateway is, this side does not. Guarding on
 * it means a future remote-gateway URL (task 3.12) cannot be quietly sent to
 * the local backend instead. */
export const SPEECH_STREAM_IPC_URL = 'ipc://speech-stream'

const CONNECTING = 0
const OPEN = 1
const CLOSED = 3

let counter = 0

type Handler = ((event: unknown) => void) | null

class SpeechStreamSocket {
  readonly id = `speech-${(counter += 1)}`

  /** Accepted and ignored: their player sets `'arraybuffer'`, and binary frames
   * arrive as bytes over IPC regardless. */
  binaryType = 'arraybuffer'
  readyState: number = CONNECTING

  onopen: Handler = null
  onmessage: Handler = null
  onerror: Handler = null
  onclose: Handler = null

  private pending: string[] = []
  private unsubscribe: (() => void) | null = null

  constructor() {
    this.unsubscribe = window.aecpilot.onSpeechStreamEvent((event) => {
      if (event.id === this.id) this.receive(event)
    })

    void window.aecpilot
      .openSpeechStream(this.id)
      .then((result) => {
        if (!result.ok) this.fail()
      })
      .catch(() => this.fail())
  }

  send(data: string): void {
    if (this.readyState === OPEN) {
      void window.aecpilot.sendSpeechFrame(this.id, data).catch(() => this.fail())
      return
    }

    if (this.readyState === CONNECTING) this.pending.push(data)
  }

  close(): void {
    if (this.readyState === CLOSED) return

    this.readyState = CLOSED
    this.pending = []
    this.unsubscribe?.()
    this.unsubscribe = null
    void window.aecpilot.closeSpeechStream(this.id).catch(() => undefined)
  }

  private receive(event: SpeechStreamEvent): void {
    if (event.type === 'open') {
      this.readyState = OPEN
      const queued = this.pending.splice(0)
      for (const frame of queued) {
        void window.aecpilot.sendSpeechFrame(this.id, frame).catch(() => this.fail())
      }
      this.onopen?.(new Event('open'))
      return
    }

    if (event.type === 'text') {
      this.onmessage?.({ data: event.text ?? '' })
      return
    }

    if (event.type === 'audio') {
      const bytes = event.audio
      if (!bytes) return
      // Their scheduler reads `bytes.buffer` with the view's offset, so hand it
      // an ArrayBuffer that is exactly this chunk — `.buffer` of a view into a
      // larger allocation would replay the neighbours as noise.
      this.onmessage?.({ data: bytes.slice().buffer })
      return
    }

    if (event.type === 'error') {
      this.fail()
      return
    }

    this.finish()
  }

  /** Their player reads an error as "no streaming here" and speaks the whole
   * reply over POST instead, so a failure is delivered, not thrown. */
  private fail(): void {
    if (this.readyState === CLOSED) return

    this.onerror?.(new Event('error'))
    this.finish()
  }

  private finish(): void {
    if (this.readyState === CLOSED) return

    this.readyState = CLOSED
    this.pending = []
    this.unsubscribe?.()
    this.unsubscribe = null
    this.onclose?.(new Event('close'))
  }
}

/** The cast is contained here rather than in their file: this object has the
 * members their player uses and none of the rest of the WebSocket API, and it
 * is not worth faking `dispatchEvent`, `extensions` or `protocol` that nobody
 * calls. */
export function createSpeechStreamSocket(url: string): WebSocket {
  if (url !== SPEECH_STREAM_IPC_URL) {
    throw new Error(`speech stream: unexpected target ${url} (SPEC C9)`)
  }

  return new SpeechStreamSocket() as unknown as WebSocket
}
