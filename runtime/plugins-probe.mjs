// One-shot diagnostic for task 1.6.B2a.1 — measures what `plugins.manage`
// actually does on OUR launch path, before any of it is wired into a screen.
//
// Two things the plugins section cannot be written honestly without:
//
//   1. Whether any plugins exist here at all. Their handler discovers them on
//      disk (`_discover_all_plugins`); a profile with none must produce an
//      empty state that explains itself rather than a screen that looks broken.
//   2. Whether toggling reaches an ALREADY-BUILT agent, or only a session
//      created afterwards. Their doc comment says the three surfaces "agree on
//      what's installed and what's enabled" — that is about the config, not
//      about a live agent. The screen must say the truth, and the truth is not
//      guessable from the handler alone: enabling a plugin changes a set on
//      disk, and whether a running agent re-reads it is a property of the
//      agent's construction.
//
// Method: create a session (which builds an agent), read its tool inventory
// from `session.info`, toggle a plugin, read the inventory again, then create
// a SECOND session and read a third time. The three readings answer the
// question without guessing.
//
// Read-only in effect: the toggle is undone in a `finally`, so a failure
// between the two cannot leave the profile changed. That guard was added AFTER
// this probe's first run did exactly that — the restore sat after another RPC,
// which failed, and a plugin stayed enabled in the owner's profile.
//
// MEASURED 2026-07-30 on the dev profile (see task 1.6.B2a.1 in `git show 64fa482^:TASKS.md` for the full
// reading):
//   - 80 plugins, all bundled, none active. There are THREE status strings,
//     not two: "not enabled" (never touched), "disabled" (explicitly turned
//     off) and "enabled". Turning something off leaves the explicit form, so a
//     screen that compares against "not enabled" would mislabel it.
//   - `session.info.tools` is EMPTY for a freshly created session, so the tool
//     inventory cannot be used to detect a plugin's effect. The second
//     question this probe was written to answer is therefore unanswerable this
//     way, and the screen must not promise "applies immediately".
//   - `session.resume` takes the STORED session id; a session that never
//     submitted a prompt has no stored row and answers 4007.
//
// Usage: node runtime/plugins-probe.mjs

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18997
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
        if (frame.error) entry.rej(new Error(`${frame.error.code}: ${frame.error.message}`))
        else entry.res(frame.result)
      }
    })
  })
}

const handle = await startServe({ port: PORT })
let rpc
try {
  await waitHealthy(handle)
  rpc = await connect(handle)

  // --- 1. What is installed -------------------------------------------------
  const listing = await rpc.request('plugins.manage', { action: 'list' })
  const rows = listing.plugins ?? []
  console.log(
    `plugins.manage list -> ${rows.length} шт. (user ${listing.user_count}, bundled ${listing.bundled_count})`
  )
  for (const row of rows) {
    console.log(`   ${row.name} v${row.version} [${row.source}] status=${row.status}`)
  }
  if (rows.length === 0) {
    console.log('\nВЫВОД: плагинов нет вовсе — раздел должен объяснять пустоту, а не показывать ноль.')
  }

  // --- 2. Does a toggle reach an already-built agent? -----------------------
  const first = await rpc.request('session.create', { source: 'probe', cwd: process.cwd() })
  const before = first.info?.tools ?? {}
  console.log(`\nсессия A: инструментов в session.info -> ${Object.keys(before).length}`)

  const target = rows.find((r) => r.status === 'enabled') ?? rows[0]
  if (!target) {
    console.log('переключать нечего — второй вопрос пробы остаётся без ответа')
  } else {
    const wasEnabled = target.status === 'enabled'
    const toggled = await rpc.request('plugins.manage', {
      action: 'toggle',
      name: target.name,
      enable: !wasEnabled
    })
    console.log(
      `toggle ${target.name} -> ok=${toggled.ok} unchanged=${toggled.unchanged} status=${toggled.plugin?.status}`
    )

    // NOT `session.resume` here: it addresses the STORED session id, and a
    // session that never submitted a prompt has no stored row yet — it answers
    // 4007. A second `session.create` is the only way to ask "what would a NEW
    // agent get", which is exactly the question.
    try {
      const second = await rpc.request('session.create', { source: 'probe', cwd: process.cwd() })
      console.log(
        `сессия B (создана после переключения): инструментов -> ${Object.keys(second.info?.tools ?? {}).length}`
      )
      await rpc.request('session.close', { session_id: second.session_id }).catch(() => {})
    } finally {
      // Restore no matter what: this probe must not leave the owner's profile
      // with a plugin it did not have enabled.
      const restored = await rpc.request('plugins.manage', {
        action: 'toggle',
        name: target.name,
        enable: wasEnabled
      })
      console.log(
        `восстановлено: ${target.name} -> status=${restored.plugin?.status} (было ${target.status})`
      )
    }
  }
  await rpc.request('session.close', { session_id: first.session_id }).catch(() => {})
} finally {
  try {
    rpc?.close()
  } catch {
    /* closing a dead socket is not a failure */
  }
  await stopServe(handle)
}
