// One-shot diagnostic for task 3.9 — what the external-channel surface looks
// like on OUR launch path (`hermes serve`), before any of it is shown to a user.
//
// AC10 says the shipped product has every external channel OFF and that turning
// one on takes an explicit action. The screen is the donor's; the DEFAULTS are
// the core's. That makes the acceptance criterion a measurement, not a promise —
// and this file is the measurement.
//
// It also answers two questions the screen's code cannot: whether the write
// paths exist under `hermes serve` (their dashboard has routes ours does not),
// and what one platform record actually carries — the disclosure screen (task
// 3.10) has to name the data that leaves the machine, and it can only name what
// is really in there.
//
// MEASURED 2026-08-17 on the dev profile, core 0.20.0:
//   • 33 platforms, EVERY ONE `enabled:false`, `configured:false`,
//     `state:"disabled"`. Nothing is on until someone turns it on — AC10's
//     first half holds without us doing anything to enforce it.
//   • `PUT /api/messaging/platforms/<id>` → 200, and `POST .../test` → 200 with
//     a readable "it is disabled, enable it then restart the gateway". So the
//     screen is fully functional here, not read-only.
//   • `GET /api/messaging/pairing` → 404 "Headless backend (hermes serve): web
//     UI disabled". Pairing (approving an outside person to talk to the agent)
//     has NO backend on our launch path. Their screen already treats a failing
//     pairing call as "no rows, no banner" on purpose, so nothing breaks — but
//     the section stays empty, and that is a product fact, not a bug to chase.
//   • A platform record carries: id, name, description, docs_url, enabled,
//     configured, gateway_running, state, error_code, error_message,
//     updated_at, home_channel, and env_vars[] of
//     {key, required, is_set, redacted_value, description, prompt, help, url,
//     is_password, advanced}. Note `redacted_value` — the screen shows a masked
//     credential, never the value.
//
// Read-only in effect: the only write is `enabled:false` on a platform that is
// already disabled, so a failure between the calls cannot leave a channel on.
//
// Usage: node runtime/messaging-probe.mjs

import http from 'node:http'
import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18990

function call(handle, method, path, payload) {
  return new Promise((resolve) => {
    const data = payload === undefined ? undefined : JSON.stringify(payload)
    const req = http.request(
      {
        method,
        host: handle.host,
        port: handle.port,
        path,
        headers: {
          'X-Hermes-Session-Token': handle.token,
          ...(data === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) })
        }
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      }
    )
    req.on('error', (error) => resolve({ status: 0, body: String(error) }))
    if (data !== undefined) req.write(data)
    req.end()
  })
}

async function main() {
  let handle
  try {
    handle = await startServe({ port: PORT })
    await waitHealthy(handle, 240000)

    const platforms = await call(handle, 'GET', '/api/messaging/platforms')
    const rows = JSON.parse(platforms.body).platforms ?? []
    const on = rows.filter((row) => row.enabled)

    console.log(`— каналы: ${rows.length}, включено ${on.length}`)
    console.log(
      on.length === 0
        ? '  AC10 (первая половина): в чистой поставке включённых каналов нет'
        : `  ВНИМАНИЕ, включены по умолчанию: ${on.map((row) => row.id).join(', ')}`
    )

    const sample = rows.find((row) => row.id === 'ntfy') ?? rows[0]
    if (sample) {
      console.log(`— запись «${sample.id}»: ${Object.keys(sample).join(', ')}`)
      console.log(`  поля переменной: ${Object.keys(sample.env_vars?.[0] ?? {}).join(', ') || '(нет)'}`)
    }

    const pairing = await call(handle, 'GET', '/api/messaging/pairing')
    console.log(
      pairing.status === 200
        ? '— сопряжение: доступно'
        : `— сопряжение: ${pairing.status} — на нашем пути запуска его нет, раздел останется пустым`
    )

    // Единственная запись: выключить уже выключенный канал.
    const write = await call(handle, 'PUT', `/api/messaging/platforms/${sample.id}`, { enabled: false })
    console.log(`— запись настроек: ${write.status} ${write.status === 200 ? '(экран не только читает)' : ''}`)
  } finally {
    if (handle) await stopServe(handle)
  }
}

main().catch((error) => {
  console.error('проба провалилась:', error)
  process.exitCode = 1
})
