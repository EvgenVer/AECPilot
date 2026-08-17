// Transport half of the streaming-speech bridge (task 3.7a) — the part that
// touches `WebSocket` and therefore cannot be unit-tested without a server;
// every rule it applies lives in `speech-stream-pure.ts` next to its tests.
// Same split as `hermes-rest.ts` / `hermes-rest-pure.ts`.
//
// What this is: main holds the socket to `/api/audio/speak-stream` and relays
// it. Text frames go up (their `{text}` / `{done}` / `{stop}`), PCM and control
// frames come down. The renderer never learns the URL or the token — see the
// header of the pure half for why there is no narrower credential to hand it.
//
// Failure is not an error state here: a socket that never opens, or drops
// before any audio, must reach the renderer as a plain event, because their
// player treats exactly that as "no streaming — speak the whole reply over
// POST". Degrading to the slower path is the correct outcome, not a bug report.

import type { SpeechStreamEvent } from '../shared/ipc'
import type { RestTarget } from './hermes-rest-pure'
import { buildSpeakStreamUrl, parseSpeechFrame } from './speech-stream-pure'

/** One playing reply per window is the shape their player has — it stops the
 * previous clip before starting the next. The cap is not a product limit, it is
 * a leak stop: a renderer that opens and forgets would otherwise keep backend
 * synthesis threads alive one per attempt. */
const MAX_STREAMS_PER_WINDOW = 4

/** Keyed `<webContentsId>:<renderer id>` so two windows cannot collide and
 * neither can address the other's stream (`isValidStreamId` keeps the colon out
 * of the renderer's half). */
const sockets = new Map<string, WebSocket>()

export function streamKey(webContentsId: number, id: string): string {
  return `${webContentsId}:${id}`
}

export interface SpeechStreamResult {
  ok: boolean
  error?: string
}

export function openSpeechStream(
  key: string,
  target: RestTarget | undefined,
  emit: (event: Omit<SpeechStreamEvent, 'id'>) => void
): SpeechStreamResult {
  if (!target) return { ok: false, error: 'речевой шлюз недоступен' }
  if (sockets.has(key)) return { ok: false, error: 'поток с таким идентификатором уже открыт' }

  const owner = `${key.slice(0, key.indexOf(':') + 1)}`
  let mine = 0
  for (const existing of sockets.keys()) if (existing.startsWith(owner)) mine += 1
  if (mine >= MAX_STREAMS_PER_WINDOW)
    return { ok: false, error: 'слишком много открытых потоков речи' }

  let ws: WebSocket
  try {
    ws = new WebSocket(buildSpeakStreamUrl(target))
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  ws.binaryType = 'arraybuffer'
  sockets.set(key, ws)

  // Their protocol starts with a control frame — `start` (PCM follows, and it
  // carries the sample rate) or `fallback` (this provider has no chunked API).
  // Audio arriving before one has been seen means that frame was lost, and its
  // sample rate cannot be guessed: playing anyway would be noise, ignoring it
  // silently would be worse — their player would count the reply as spoken
  // while nothing came out. So it is reported as a failure, which is what makes
  // the reply come back over POST instead.
  //
  // Not hypothetical: measured 2026-08-17 (`runtime/speech-stream-probe.mjs`),
  // Node's own WebSocket client delivers `error` + code 1006 and DROPS the
  // frame when the server sends one and closes in the same breath — which is
  // exactly what the core does when the provider cannot stream. The same loss
  // on a session that does stream has not been observed (a prompt frame on a
  // connection that stays open arrives fine — the gateway's own `gateway.ready`
  // proves that), and could not be: it needs a provider we have no key for.
  let sawControlFrame = false

  ws.onopen = () => emit({ type: 'open' })

  ws.onmessage = (event: MessageEvent) => {
    if (typeof event.data === 'string') {
      sawControlFrame = true
      emit({ type: 'text', text: event.data })
      return
    }
    if (event.data instanceof ArrayBuffer) {
      if (!sawControlFrame) {
        emit({ type: 'error' })
        closeSpeechStream(key)
        return
      }
      emit({ type: 'audio', audio: new Uint8Array(event.data) })
    }
  }

  // No detail on purpose: a socket error here says nothing a user could act on,
  // and the renderer's response to it is to fall back, not to display it.
  ws.onerror = () => emit({ type: 'error' })

  ws.onclose = () => {
    sockets.delete(key)
    emit({ type: 'close' })
  }

  return { ok: true }
}

export function sendSpeechFrame(key: string, raw: unknown): SpeechStreamResult {
  const ws = sockets.get(key)
  if (!ws) return { ok: false, error: 'поток речи не открыт' }

  const parsed = parseSpeechFrame(raw)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  if (ws.readyState !== WebSocket.OPEN) return { ok: false, error: 'поток речи ещё не готов' }

  try {
    ws.send(parsed.frame)
    return { ok: true }
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/** Closing the socket is how a barge-in reaches the backend: their server
 * aborts synthesis on disconnect. */
export function closeSpeechStream(key: string): void {
  const ws = sockets.get(key)
  if (!ws) return

  sockets.delete(key)
  try {
    ws.close()
  } catch {
    // already closing
  }
}

/** A reload or a closed window leaves nobody to receive the audio, and the
 * backend would keep synthesizing into it. */
export function closeSpeechStreamsFor(webContentsId: number): void {
  const prefix = `${webContentsId}:`
  for (const key of [...sockets.keys()]) {
    if (key.startsWith(prefix)) closeSpeechStream(key)
  }
}
