// Contract probe for the session methods batch 5 is built on (task 1.6.B5.1).
//
// The decomposition made three claims about `tui_gateway` that decide how the
// sessions screen has to behave. Claims are cheap; this measures them:
//
//   1. `session.undo` does not touch the database — so `session.history` still
//      returns the undone turn, and it comes back on the next resume. If true,
//      a screen that removes the turn from the transcript is telling a
//      temporary truth (owner decision B5-3).
//   2. `session.undo` and `session.compress` are refused mid-turn with 4009.
//      If true, both controls must be disabled while streaming rather than
//      failing on click — the same shape already used for the model picker.
//   3. `session.list` rows carry no `cwd`. If true, sessions cannot be scoped
//      to a project by the gateway and our own tagging (main/session-projects)
//      stays necessary — this is the assumption task 1.20 was built on.
//
// Everything created here is deleted at the end. `session.delete` is
// irreversible on their side (it removes transcript rows), so the probe only
// ever deletes ids it created in this run, and never touches a pre-existing
// session.
//
// Usage: node runtime/sessions-probe.mjs
// Needs no API key for claims 1 and 3. Claim 2 needs a real turn in flight,
// which needs a model — the probe says so and skips rather than pretending.

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18995
const RPC_TIMEOUT_MS = 60000

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
            }, RPC_TIMEOUT_MS)
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
          const err = new Error(frame.error.message)
          err.code = frame.error.code
          entry.rej(err)
        } else entry.res(frame.result)
      }
    })
  })
}

/** Calls `method` and reports what came back, error or not — for methods whose
 * REFUSAL is the interesting part. */
async function attempt(rpc, method, params) {
  try {
    const result = await rpc.request(method, params)
    return { ok: true, result }
  } catch (error) {
    return { ok: false, code: error.code, message: error.message }
  }
}

const handle = await startServe({ port: PORT })
let rpc
const created = []
try {
  await waitHealthy(handle)
  rpc = await connect(handle)

  // --- Claim 3: does session.list carry cwd? -------------------------------
  const listed = await rpc.request('session.list', { limit: 5 })
  const first = (listed.sessions ?? [])[0]
  console.log(`session.list -> ${(listed.sessions ?? []).length} строк`)
  if (first) {
    const fields = Object.keys(first).sort().join(', ')
    console.log(`   поля строки: ${fields}`)
    console.log(`   УТВЕРЖДЕНИЕ 3 (нет cwd): ${'cwd' in first ? 'ОПРОВЕРГНУТО' : 'подтверждено'}`)
  } else {
    console.log('   список пуст — утверждение 3 на этом профиле не проверить')
  }

  // --- What answers at all, and with what shape ----------------------------
  const session = await rpc.request('session.create', { source: 'probe', cwd: process.cwd() })
  created.push(session)
  console.log(`\nсессия создана: live=${session.session_id} stored=${session.stored_session_id}`)

  for (const method of [
    'session.usage',
    'session.context_breakdown',
    'session.active_list',
    'session.compress',
    'session.undo',
    'session.steer',
    'session.branch',
    'session.title'
  ]) {
    const outcome = await attempt(rpc, method, { session_id: session.session_id })
    if (outcome.ok) {
      const shape = JSON.stringify(outcome.result)
      console.log(`${method} -> ok; ${shape.slice(0, 160)}`)
    } else {
      console.log(`${method} -> ошибка ${outcome.code}: ${outcome.message.slice(0, 120)}`)
    }
  }

  // --- Claim 1: does undo touch the database? ------------------------------
  // A session with no submitted prompt has nothing to undo, so this reading is
  // only meaningful once a turn exists. Reported honestly either way.
  const before = await attempt(rpc, 'session.history', { session_id: session.session_id })
  const undone = await attempt(rpc, 'session.undo', { session_id: session.session_id })
  const after = await attempt(rpc, 'session.history', { session_id: session.session_id })
  console.log(
    `\nУТВЕРЖДЕНИЕ 1 (undo не трогает БД): history до=${before.ok ? before.result.count : before.code}` +
      ` undo=${undone.ok ? JSON.stringify(undone.result) : undone.code}` +
      ` history после=${after.ok ? after.result.count : after.code}`
  )
  if (before.ok && before.result.count === 0) {
    console.log('   в сессии нет ходов — отменять нечего, утверждение требует прогона с моделью')
  }

  console.log(
    '\nУТВЕРЖДЕНИЕ 2 (undo/compress во время хода → 4009): требует живого хода, то есть модели и ключа.' +
      '\n   Проба его НЕ проверяет и не притворяется, что проверила.'
  )
} finally {
  // Only ids this run created.
  for (const s of created) {
    const id = s.stored_session_id ?? s.session_id
    const closed = await attempt(rpc, 'session.close', { session_id: s.session_id })
    const deleted = await attempt(rpc, 'session.delete', { session_id: id })
    console.log(
      `убрано: close=${closed.ok ? 'ok' : closed.code} delete=${deleted.ok ? 'ok' : deleted.code}`
    )
  }
  try {
    rpc?.close()
  } catch {
    /* closing a dead socket is not a failure */
  }
  await stopServe(handle)
}
