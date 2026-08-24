// НАСКОЛЬКО ГЛУБОКО ядро сливает `ui_meta` при `profiles.configure`?
//
// Вопрос не праздный: от ответа зависит, можно ли писать одно наше поле, не
// перечитывая остальные. Код роестра писался в предположении «сливает по нашим
// полям» — то есть `{aecpilot: {title}}` меняет только подпись. Чтение исходника
// 0.20.5 (`tui_gateway/methods_profiles.py`, цикл `current[key] = value`)
// говорит другое: слияние идёт по ключам ВЕРХНЕГО уровня `ui_meta`, то есть по
// `aecpilot` целиком.
//
// Разница — это потеря данных: если исходник прав, переименование специалиста
// стирает его роль, облик, признак скрытия, привязку постоянного чата и состав
// его комнат. Читать исходник мало — этот скрипт спрашивает само ядро.
//
// Прогонять при каждом подъёме пина: правило записи наших полей стоит на нём.
//
// Usage: node runtime/ui-meta-merge-probe.mjs

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18995
const RPC_TIMEOUT_MS = 60000
const PROFILE = 'default'

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
        if (frame.error) entry.rej(new Error(frame.error.message))
        else entry.res(frame.result)
      }
    })
  })
}

async function ourMeta(rpc) {
  const answer = await rpc.request('profiles.list', {})
  const row = (answer?.profiles ?? []).find((one) => one.name === PROFILE)
  return row?.ui_meta?.aecpilot ?? null
}

const handle = await startServe({ port: PORT })
let rpc
let before = null
let failed = false

try {
  // Ядро поднимается дольше умолчания: при старте оно подключает наши
  // MCP-серверы, а их трое.
  await waitHealthy(handle, 180000)
  rpc = await connect(handle)

  before = await ourMeta(rpc)
  console.log(`0. что лежало до пробы: ${JSON.stringify(before)}`)

  // Кладём два поля, потом пишем ТОЛЬКО одно и смотрим, выжило ли второе.
  await rpc.request('profiles.configure', {
    name: PROFILE,
    ui_meta: { aecpilot: { title: 'Проба', role: 'роль-до-пробы' } }
  })
  console.log(`1. положили оба поля: ${JSON.stringify(await ourMeta(rpc))}`)

  await rpc.request('profiles.configure', {
    name: PROFILE,
    ui_meta: { aecpilot: { title: 'Проба-2' } }
  })

  const after = await ourMeta(rpc)
  console.log(`2. записали ТОЛЬКО подпись: ${JSON.stringify(after)}`)

  const survived = after !== null && after.role === 'роль-до-пробы'
  console.log(
    survived
      ? '\nСЛИЯНИЕ ГЛУБОКОЕ: писать одно наше поле безопасно.'
      : '\nСЛИЯНИЕ ПО ВЕРХНЕМУ КЛЮЧУ: запись одного поля СТИРАЕТ остальные.'
  )
  console.log('   (второе — то, что говорит исходник; тогда писать надо целиком)')
  failed = survived
} catch (error) {
  console.error(`проба сорвалась: ${error.message}`)
  failed = true
} finally {
  // Возвращаем то, что лежало: проба не должна оставлять следов в профиле.
  if (rpc) {
    try {
      await rpc.request('profiles.configure', {
        name: PROFILE,
        ui_meta: { aecpilot: before ?? null }
      })
      console.log(`3. вернули как было: ${JSON.stringify(await ourMeta(rpc))}`)
    } catch (error) {
      console.error(`не удалось вернуть как было: ${error.message}`)
    }
    rpc.close()
  }
  await stopServe(handle)
}

process.exit(failed ? 1 : 0)
