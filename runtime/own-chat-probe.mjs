// Контракт, на который встала задача 3C.4б: постоянный чат специалиста мы
// опознаём по МЕТКЕ ИСТОЧНИКА в списке сессий, а не по заголовку.
//
// Замерено этим скриптом 2026-08-23 на ядре 0.20.5, и первое утверждение
// пришлось переписать по результату — оно было предположением:
//
//   1. Строка `session.list` НЕСЁТ `source` — 88 строк из 88 на живом профиле.
//      Поля строки: id, title, preview, started_at, message_count, source.
//      Значит свою сессию есть по чему отличить от разговора человека.
//   2. Сессия БЕЗ ЕДИНОГО ХОДА в списке не появляется вовсе — ни с
//      `include_hidden`, ни без него, ни после `session.save` (тот пишет файл
//      выгрузки, а не строку базы). Список читает базу, а строка там заводится
//      первым ходом. Следствие для 3C.4б доброе: находится ЗАВЕДЁННЫЙ чат, а
//      пустой черновик не находится — и заменить его новым не потеря.
//   3. `resolved_id` (живая вершина сжатой переписки) в обычной выдаче НЕТ —
//      его отдаёт только ветка точного поиска по заголовку. Код читает его
//      «если будет», а сжатие в основном пути разрешается привязкой.
//
// Прогонять при каждом подъёме пина: если строка перестанет нести `source`,
// постоянные чаты начнут плодиться молча.
//
// Usage: node runtime/own-chat-probe.mjs

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18994
const RPC_TIMEOUT_MS = 60000
const SOURCE = 'aecpilot-roster'

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

const handle = await startServe({ port: PORT })
let rpc
let created = ''
let failed = false

try {
  await waitHealthy(handle)
  rpc = await connect(handle)

  const made = await rpc.request('session.create', { source: SOURCE, hidden: true })
  created = made?.session_id ?? ''
  console.log(`1. session.create -> ${created || '(пусто)'}`)
  if (!created) throw new Error('ядро не вернуло сессию')

  // Пустая сессия у них живёт в памяти и в списке не появляется — список читает
  // базу. `session.save` — это то, что её туда кладёт.
  const saved = await rpc.request('session.save', { session_id: created }).catch((error) => ({
    error: error.message
  }))
  console.log(`1a. session.save -> ${JSON.stringify(saved)}`)

  const hiddenOff = await rpc.request('session.list', {})
  const hiddenOn = await rpc.request('session.list', { include_hidden: true })

  const rowsOff = hiddenOff?.sessions ?? []
  const rowsOn = hiddenOn?.sessions ?? []
  const foundOff = rowsOff.some((row) => row.id === created)
  const foundOn = rowsOn.find((row) => row.id === created)

  console.log(`2. пустая сессия без include_hidden видна: ${foundOff}`)
  console.log(`   пустая сессия с include_hidden видна:  ${Boolean(foundOn)}`)

  // Главное, что надо было выяснить: строка списка вообще НЕСЁТ `source`, и по
  // нему свою сессию можно отличить от разговора человека. Пустая сессия в
  // список не попадает (список читает базу, а строка появляется там с первым
  // ходом), поэтому смотрим на те, что уже есть.
  console.log(`3. всего строк с include_hidden: ${rowsOn.length}`)
  const withSource = rowsOn.filter((row) => typeof row.source === 'string' && row.source !== '')
  console.log(`   из них с непустым source: ${withSource.length}`)
  console.log(`   поля строки: ${rowsOn[0] ? Object.keys(rowsOn[0]).join(', ') : '—'}`)
  console.log(`   встреченные источники: ${[...new Set(withSource.map((r) => r.source))].join(', ') || '—'}`)

  failed = rowsOn.length > 0 && withSource.length === 0
  console.log(
    failed
      ? '\nСВЕРКА ПРОВАЛЕНА: строки списка не несут source'
      : '\nсверка: список отдаёт source, отличить свою сессию есть по чему'
  )
} finally {
  if (created && rpc) {
    // Пустую сессию удалять нечем и незачем: строки в базе у неё нет (см. п. 2
    // в шапке), «session not found» здесь — подтверждение замера, а не сбой.
    // Живёт она в памяти процесса и уходит вместе с ним.
    const removed = await rpc
      .request('session.delete', { session_id: created })
      .then(() => 'убрана из базы')
      .catch((error) => `в базе её и не было (${error.message})`)
    console.log(`(созданная сессия ${created}: ${removed})`)
  }
  rpc?.close()
  stopServe(handle)
}

process.exitCode = failed ? 1 : 0
