// Contract probe for the profile routes batch 5 builds on (task 1.6.B5.23).
//
// Owner decision B5-1=C makes profiles a full surface (list / create / switch /
// delete), and R1 allows REST exactly where JSON-RPC does not reach — there are
// no `profile.*` methods in tui_gateway at all. That is a claim about THEIR
// dashboard, so this measures it before a line of the screen is written:
//
//   1. `GET /api/profiles` — does it answer, and with which fields per row?
//   2. `GET /api/profiles/active` — what is the difference between `active`
//      (the sticky default for future CLI runs) and `current` (what THIS
//      process runs as)? The screen's honesty depends on it.
//   3. `POST /api/profiles` — does creating one work, and does the list see it?
//   4. `session.create {profile}` — is the RPC parameter accepted for a
//      non-launch profile? This is the half that actually re-targets a chat;
//      their own comment says `POST /api/profiles/active` does NOT.
//   5. `DELETE /api/profiles/{name}` — does it remove it again?
//
// SAFETY, and the reason it is written this way (lesson of probe 1.6.B2a.1,
// which left the dev profile dirty): the only profile this probe ever creates
// or deletes is its own, named with a fixed prefix; deletion runs in `finally`
// so a failure halfway through still cleans up. It never touches `default`, and
// it never calls `POST /api/profiles/active` — that writes a sticky preference
// outside this repo's control. Profiles live under HERMES_HOME
// (`runtime/dev-profile/profiles/`), i.e. inside the workspace.
//
// Usage: node runtime/profiles-probe.mjs
// Needs no API key: nothing here asks a model anything.

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18994
const PROBE_PROFILE = 'aecpilot-probe-tmp'

async function rest(handle, path, options = {}) {
  const { method = 'GET', body } = options
  const response = await fetch(`http://${handle.host}:${handle.port}${path}`, {
    method,
    headers: {
      'X-Hermes-Session-Token': handle.token,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await response.text()
  let parsed = text
  try {
    parsed = text === '' ? null : JSON.parse(text)
  } catch {
    /* keep the raw text — an HTML error page is still an answer */
  }
  return { status: response.status, body: parsed }
}

function connect(handle) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(handle.wsUrl)
    const pending = new Map()
    let nextId = 1
    ws.addEventListener('open', () =>
      resolve({
        request(method, params = {}) {
          const id = nextId++
          ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(id)
              rej(new Error(`${method} timed out`))
            }, 60000)
            pending.set(id, { res, rej, timer })
          })
        },
        close: () => ws.close()
      })
    )
    ws.addEventListener('error', () => reject(new Error('websocket failed')))
    ws.addEventListener('message', (event) => {
      for (const line of String(event.data).split('\n')) {
        if (!line.trim()) continue
        let frame
        try {
          frame = JSON.parse(line)
        } catch {
          continue
        }
        const entry = frame.id !== undefined && pending.get(frame.id)
        if (!entry) continue
        clearTimeout(entry.timer)
        pending.delete(frame.id)
        if (frame.error) {
          const error = new Error(frame.error.message)
          error.code = frame.error.code
          entry.rej(error)
        } else entry.res(frame.result)
      }
    })
  })
}

async function attempt(rpc, method, params) {
  try {
    return { ok: true, result: await rpc.request(method, params) }
  } catch (error) {
    return { ok: false, code: error.code, message: error.message }
  }
}

const handle = await startServe({ port: PORT })
let rpc
let created = false
const sessions = []
try {
  await waitHealthy(handle, 60000)
  rpc = await connect(handle)

  // --- 1. The list --------------------------------------------------------
  const listed = await rest(handle, '/api/profiles')
  const rows = listed.body?.profiles ?? []
  console.log(`GET /api/profiles -> ${listed.status}, профилей ${rows.length}`)
  if (rows[0]) console.log(`   поля строки: ${Object.keys(rows[0]).sort().join(', ')}`)

  // --- 2. Active vs current ----------------------------------------------
  const active = await rest(handle, '/api/profiles/active')
  console.log(
    `GET /api/profiles/active -> ${active.status}, ${JSON.stringify(active.body)}` +
      '\n   (`active` — липкий профиль для будущих запусков CLI, `current` — под каким' +
      ' работает ЭТОТ процесс; их обработчик их различает намеренно)'
  )

  // --- 3. Creating one ----------------------------------------------------
  const createResponse = await rest(handle, '/api/profiles', {
    method: 'POST',
    body: { name: PROBE_PROFILE }
  })
  created = createResponse.status < 400
  console.log(
    `POST /api/profiles -> ${createResponse.status}; ${JSON.stringify(createResponse.body).slice(0, 200)}`
  )
  const afterCreate = await rest(handle, '/api/profiles')
  const names = (afterCreate.body?.profiles ?? []).map((row) => row.name)
  console.log(`   список после создания: ${names.join(', ')}`)
  console.log(`   ПРОФИЛЬ ВИДЕН В СПИСКЕ: ${names.includes(PROBE_PROFILE) ? 'да' : 'НЕТ'}`)

  // --- 4. Does the RPC accept the profile parameter? -----------------------
  if (created) {
    const scoped = await attempt(rpc, 'session.create', {
      source: 'probe',
      profile: PROBE_PROFILE
    })
    if (scoped.ok) {
      sessions.push(scoped.result)
      console.log(
        `session.create {profile} -> ok; live=${scoped.result.session_id}` +
          ` stored=${scoped.result.stored_session_id}`
      )
      console.log('   значит переключение профиля для чата делается ИМЕННО этим параметром')
    } else {
      console.log(`session.create {profile} -> ошибка ${scoped.code}: ${scoped.message}`)
    }
  }
} finally {
  for (const session of sessions) {
    await attempt(rpc, 'session.close', { session_id: session.session_id })
  }
  if (created) {
    const removed = await rest(handle, `/api/profiles/${PROBE_PROFILE}`, { method: 'DELETE' })
    console.log(`DELETE /api/profiles/${PROBE_PROFILE} -> ${removed.status}`)
    const afterDelete = await rest(handle, '/api/profiles')
    const names = (afterDelete.body?.profiles ?? []).map((row) => row.name)
    console.log(`   ПРОФИЛЬ УБРАН: ${names.includes(PROBE_PROFILE) ? 'НЕТ — остался!' : 'да'}`)
  }
  try {
    rpc?.close()
  } catch {
    /* closing a dead socket is not a failure */
  }
  await stopServe(handle)
}
