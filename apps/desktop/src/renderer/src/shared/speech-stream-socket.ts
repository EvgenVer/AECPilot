// The seam of edit [1] in `donor/lib/voice-playback.ts` — where their player
// constructs its speech-stream socket.
//
// Task 3.7a put a WebSocket-shaped object over our IPC bridge here. Task 3H.3
// removed it together with main's `speech:*` handlers: all voice is SPEC HX19
// since the owner decision 2026-10-07, and nothing that is still rendered calls
// their player (the per-answer "read aloud" button is gone). The seam stays so
// their file keeps its one import, and it REFUSES rather than pretends — the
// rule PLAN sets for every shim stand-in.

/** The address their code passes to the constructor — a marker, not a
 * destination (SPEC C9 keeps the gateway URL out of the renderer). */
export const SPEECH_STREAM_IPC_URL = 'ipc://speech-stream'

export function createSpeechStreamSocket(_url: string): WebSocket {
  throw new Error('speech stream: voice is not part of this product (SPEC HX19)')
}
