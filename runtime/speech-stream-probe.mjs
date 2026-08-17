// One-shot diagnostic for task 3.7a — measures what `/api/audio/speak-stream`
// actually answers on OUR launch path, using the exact URL the main process
// builds for it.
//
// Why it exists. Voice mode's live speech goes through a WebSocket that the
// renderer is not allowed to open (SPEC C9), so main holds it. That puts three
// assumptions between the user and any sound, and none of them is visible from
// the code:
//
//   1. The endpoint authenticates with `?token=<session token>` — the same
//      loopback credential the REST bridge uses. If that were wrong, the socket
//      would close with 4401 and the app would fall back to whole-text speech
//      forever, silently and looking fine.
//   2. The FIRST frame decides everything. `{"type":"start"}` means PCM is
//      coming; `{"type":"fallback"}` means the configured provider has no
//      chunked API and the client must speak the whole reply over POST. Which
//      one arrives is a property of the profile's TTS config, not of our code.
//   3. Whether any of this needs the network. The default provider (Edge, no
//      key) is not a streamer at all, so resolution fails locally and the
//      answer comes back without a single request leaving the machine.
//
// MEASURED 2026-08-17 on the dev profile, core 0.20.0:
//
//   • the upgrade is accepted — raw handshake 101 with the session token, 403
//     without it. Their handler's `close(4401)` never reaches the wire: it
//     closes BEFORE accepting, which uvicorn turns into an HTTP 403, so a
//     client sees 1006 and no code. Do not debug that as a network fault.
//   • on the default provider the answer is `{"type":"fallback"}` immediately,
//     then close(1000) — 25 bytes total, read straight off the socket. Edge TTS
//     is not a streamer at all, so nothing left the machine to produce it.
//   • Node's own WebSocket client DROPS that frame: it reports `error` and code
//     1006 instead. The bytes are on the wire (this probe reads them), the
//     client just does not deliver a frame that is followed by an immediate
//     close. Harmless in the app — main relays the error, and their player
//     reads any error as "no streaming" and speaks the reply over POST — but it
//     is why `main/speech-stream.ts` refuses PCM that arrives with no control
//     frame before it.
//   • a streaming session (start → PCM → end) is NOT covered here: the four
//     providers with a chunked API all need a paid key.
//
// Also worth knowing, from the same run: `POST /api/audio/speak` answers 200
// for English text and 400 "No audio was received" for Russian, because the
// core's default voice is `en-US-AriaNeural` and Edge returns an empty stream
// for a script the voice cannot speak. Direct synthesis with
// `ru-RU-SvetlanaNeural` produced 15840 bytes on the same machine.
//
// Usage: node runtime/speech-stream-probe.mjs

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18994
const ANSWER_TIMEOUT_MS = 30000

/** The same URL `apps/desktop/src/main/speech-stream-pure.ts` builds. Kept as
 * its own function so a drift between the two is visible as a diff, not as a
 * failed probe someone has to debug. */
function speakStreamUrl(handle) {
  const url = new URL(`ws://${handle.host}:${handle.port}/api/audio/speak-stream`)
  url.searchParams.set('token', handle.token)
  return url.toString()
}

/**
 * Listens FIRST, speaks second — deliberately unlike their client.
 *
 * The server decides before reading anything: right after accepting the upgrade
 * it resolves the provider and sends `start` or `fallback`. Their player does
 * not wait for that and pushes text immediately, which is fine for it (both
 * answers lead somewhere sensible) but useless for a probe: writing into a
 * socket the server is already closing loses the very frame this file exists to
 * read. The first run did exactly that and reported "no frames, code 1006",
 * which says nothing about the endpoint — the raw handshake was 101 all along.
 */
function collect(url, text) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    const frames = []
    let audioBytes = 0
    let audioChunks = 0

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error(`нет ответа за ${ANSWER_TIMEOUT_MS} мс`))
    }, ANSWER_TIMEOUT_MS)

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        frames.push(event.data)
        // Only a stream that actually started has any use for text.
        if (event.data.includes('"start"')) {
          ws.send(JSON.stringify({ text }))
          ws.send(JSON.stringify({ done: true }))
        }
        return
      }
      audioChunks += 1
      audioBytes += event.data.byteLength
    })

    ws.addEventListener('error', () => {
      clearTimeout(timer)
      // A closed-before-open socket surfaces here with no detail; the close
      // code below is what actually says why.
    })

    ws.addEventListener('close', (event) => {
      clearTimeout(timer)
      resolve({ frames, audioChunks, audioBytes, code: event.code, reason: event.reason })
    })
  })
}

async function main() {
  let handle
  try {
    handle = await startServe({ port: PORT })
    await waitHealthy(handle, 240000)

    console.log('— проба потоковой речи —')

    const ok = await collect(speakStreamUrl(handle), 'Проверка потоковой речи. Второе предложение.')
    console.log('  кадры сервера:', ok.frames.length ? ok.frames.join(' | ') : '(нет)')
    console.log(`  звук: ${ok.audioChunks} кусков, ${ok.audioBytes} байт`)
    console.log(`  закрытие: код ${ok.code}${ok.reason ? ` (${ok.reason})` : ''}`)
    console.log(
      ok.frames.some((frame) => frame.includes('"fallback"'))
        ? '  ВЫВОД: у настроенного провайдера нет потокового API — клиент читает ответ через POST'
        : '  ВЫВОД: поток пошёл, речь начнётся с первого предложения'
    )

    // The wrong-token case never becomes a WebSocket at all: their handler
    // closes BEFORE accepting, which uvicorn turns into an HTTP 403 during the
    // handshake. The client therefore sees 1006 ("no close frame"), not their
    // 4401 — the code is in the handler, but nothing on the wire ever carries
    // it. Worth knowing before someone debugs a 1006 as a network fault.
    const bad = await collect(
      `ws://${handle.host}:${handle.port}/api/audio/speak-stream?token=неверный`,
      'проверка'
    )
    console.log(`— с неверным токеном: код закрытия ${bad.code}, кадров ${bad.frames.length}`)
  } finally {
    if (handle) await stopServe(handle)
  }
}

main().catch((error) => {
  console.error('проба провалилась:', error)
  process.exitCode = 1
})
