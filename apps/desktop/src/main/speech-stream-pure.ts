// Pure half of the streaming-speech bridge (task 3.7a). No `WebSocket`, no
// electron — so the two rules that matter are pinned by tests instead of by
// reading the transport next door.
//
// Why this bridge exists at all. Their desktop opens `/api/audio/speak-stream`
// straight from the renderer, because their renderer is handed the gateway's
// URL and token. Ours is not (SPEC C9), and the reason is not squeamishness:
// in the mode we run (loopback, no auth gate) the core authenticates a
// WebSocket with `?token=<_SESSION_TOKEN>` — the SAME token that authorizes
// every JSON-RPC method and every REST route. There is no credential that
// opens only the audio socket, so "let the renderer have just this one" is not
// an option that exists. Main opens it; the renderer gets frames.
//
// The second rule follows from the first: a relay that forwards whatever the
// renderer hands it would be a generic socket with extra steps. Only their own
// three frame shapes go through.

import type { RestTarget } from './hermes-rest-pure'

/** Their PCM speech endpoint on the same host/port/token as everything else.
 *
 * The token rides in the query because a WebSocket upgrade carries no custom
 * headers — this is what their own desktop sends, and what the core's
 * `_ws_auth_reason` reads. It stays inside the main process: the URL is built
 * here and never handed out.
 *
 * No `?profile=`: one gateway, one active profile, owned by main — the same
 * reason our REST bridge drops the donor's per-call profile scoping. */
export function buildSpeakStreamUrl(target: RestTarget): string {
  const url = new URL(`ws://${target.host}:${target.port}/api/audio/speak-stream`)
  url.searchParams.set('token', target.token)

  return url.toString()
}

/** Stream ids come from the renderer so it can tell events apart before its
 * `open` round-trip returns. That makes the id untrusted input: it is used as a
 * map key here and must not be able to impersonate another window's stream
 * (keys are `<webContentsId>:<id>`, so a colon would do exactly that). */
export function isValidStreamId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}

export type ParsedSpeechFrame = { ok: true; frame: string } | { ok: false; error: string }

/**
 * Narrows what the renderer may say into the socket to the protocol the core
 * documents on this endpoint: `{text}` deltas, `{done: true}` to end the reply,
 * `{stop: true}` to barge in. Anything else — extra keys, wrong types, a bare
 * string — is refused by name.
 *
 * It RE-SERIALIZES rather than forwarding the original text, so nothing can
 * ride along in a field this function never looked at.
 */
export function parseSpeechFrame(raw: unknown): ParsedSpeechFrame {
  if (typeof raw !== 'string') return { ok: false, error: 'speech frame must be a JSON string' }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'speech frame is not valid JSON' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'speech frame must be a JSON object' }
  }

  const frame = parsed as Record<string, unknown>
  const allowed = ['text', 'done', 'stop']
  const extra = Object.keys(frame).filter((key) => !allowed.includes(key))
  if (extra.length > 0) {
    return { ok: false, error: `speech frame has unexpected fields: ${extra.join(', ')}` }
  }

  const out: { text?: string; done?: true; stop?: true } = {}

  if ('text' in frame) {
    if (typeof frame.text !== 'string')
      return { ok: false, error: 'speech frame text must be a string' }
    out.text = frame.text
  }
  if ('done' in frame) {
    if (frame.done !== true) return { ok: false, error: 'speech frame done must be true' }
    out.done = true
  }
  if ('stop' in frame) {
    if (frame.stop !== true) return { ok: false, error: 'speech frame stop must be true' }
    out.stop = true
  }

  if (Object.keys(out).length === 0) return { ok: false, error: 'speech frame is empty' }

  return { ok: true, frame: JSON.stringify(out) }
}
