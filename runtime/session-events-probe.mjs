// Что даёт переигровка событий (`session.events.since`) против нынешнего пути —
// замер для задачи 3.B2г.
//
// НЫНЕШНИЙ ПУТЬ. Обрыв WebSocket → сокет поднимается заново → сессия
// восстанавливается через `session.resume`, который отдаёт историю ИЗ БАЗЫ.
// Строка хода попадает в базу по его ЗАВЕРШЕНИИ, поэтому у обрыва посреди
// генерации есть окно, в котором восстановить нечего: ход ещё идёт, в базе его
// нет, а кадры, пришедшие до обрыва, клиент уже потерял.
//
// НОВЫЙ ПУТЬ (0.20.6). Каждый кадр события несёт `seq`; после реконнекта клиент
// зовёт `session.events.since` со своим последним увиденным `seq` и получает
// пропущенные кадры по порядку. `truncated` честно говорит, что окно кольца
// проехало и надо перечитывать историю. `epoch` (он же в `gateway.ready`)
// ловит перезапуск шлюза, после которого счётчики начинаются заново.
//
// Проба меряет обе стороны на ОДНОМ обрыве: сколько кадров теряется и сколько
// из них возвращает переигровка.
//
// Usage: node runtime/session-events-probe.mjs

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18998
const RPC_TIMEOUT_MS = 120000
const PROMPT = 'Перечисли по одному в строке числа от 1 до 40. Только числа.'

function open(url, onEvent) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const pending = new Map()
    let nextId = 1
    const api = {
      raw: ws,
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
    }
    ws.addEventListener('open', () => resolve(api))
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
        if (frame.method === 'event') {
          onEvent?.(frame.params ?? {})
          continue
        }
        const entry = frame.id !== undefined && pending.get(frame.id)
        if (!entry) continue
        clearTimeout(entry.timer)
        pending.delete(entry.id ?? frame.id)
        pending.delete(frame.id)
        if (frame.error) entry.rej(new Error(frame.error.message))
        else entry.res(frame.result)
      }
    })
  })
}

const handle = await startServe({ port: PORT })
let first
let second
let sessionId = ''
const failures = []
const notes = []

try {
  await waitHealthy(handle)

  // ── ход, оборванный посередине ────────────────────────────────────────────
  const seen = []
  let lastSeq = 0
  let epochAtReady = ''

  first = await open(handle.wsUrl, (params) => {
    if (params.type === 'gateway.ready') epochAtReady = params.payload?.replay_epoch ?? ''
    if (typeof params.seq === 'number') lastSeq = Math.max(lastSeq, params.seq)
    seen.push(params.type)
  })

  // `gateway.ready` приходит СВОИМ кадром вскоре после открытия сокета, а
  // `open()` резолвится по событию 'open' — без этого ожидания печаталось
  // «(нет)» на живом epoch. Проба на это уже попалась 2026-08-30.
  const readyDeadline = Date.now() + 15000
  while (epochAtReady === '' && Date.now() < readyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  console.log(`replay_epoch в gateway.ready: ${epochAtReady || '(нет)'}`)
  if (!epochAtReady) {
    failures.push('gateway.ready не несёт replay_epoch — переигровка не на чем держаться')
  }

  const made = await first.request('session.create', { source: 'probe', hidden: true })
  sessionId = made?.session_id ?? ''
  const storedId = made?.stored_session_id ?? ''
  console.log(`сессия: runtime=${sessionId || '(пусто)'} durable=${storedId || '(пусто)'}`)
  if (!sessionId) throw new Error('ядро не вернуло сессию')

  await first.request('prompt.submit', { session_id: sessionId, text: PROMPT })

  // Ждём, пока пойдут дельты, и рвём связь ПОСРЕДИ хода — это и есть то окно,
  // в котором нынешний путь восстановить ничего не может.
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (seen.filter((type) => type === 'message.delta').length >= 3) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  const deltasBeforeDrop = seen.filter((type) => type === 'message.delta').length
  const seqAtDrop = lastSeq
  console.log(`\n== обрыв ==`)
  console.log(`  дельт получено до обрыва: ${deltasBeforeDrop}`)
  console.log(`  последний seq: ${seqAtDrop}`)
  if (seqAtDrop === 0) {
    failures.push('кадры событий не несут seq — клиенту не от чего отсчитывать догон')
  }

  first.raw.close()
  first = null

  // Ход продолжается на сервере, пока нас нет.
  await new Promise((resolve) => setTimeout(resolve, 4000))

  // ── что видит переподключившийся клиент ───────────────────────────────────
  second = await open(handle.wsUrl)

  const replay = await second
    .request('session.events.since', { session_id: sessionId, last_seen: seqAtDrop })
    .catch((error) => ({ error: error.message }))

  console.log(`\n== новый путь: session.events.since(last_seen=${seqAtDrop}) ==`)
  if (replay?.error) {
    failures.push(`session.events.since ответил ошибкой: ${replay.error}`)
    console.log(`  ОШИБКА: ${replay.error}`)
  } else {
    const types = (replay.events ?? []).map((frame) => frame?.params?.type ?? frame?.type ?? '?')
    const deltas = types.filter((type) => type === 'message.delta').length
    console.log(`  кадров возвращено: ${replay.count ?? 0} (из них дельт: ${deltas})`)
    console.log(`  latest_seq: ${replay.latest_seq}, truncated: ${replay.truncated}`)
    console.log(`  epoch совпадает с gateway.ready: ${replay.epoch === epochAtReady}`)
    notes.push(`переигровка вернула ${replay.count ?? 0} пропущенных кадров, из них ${deltas} дельт`)

    if ((replay.count ?? 0) === 0) {
      failures.push('переигровка вернула ноль кадров — догонять оказалось нечего')
    }
  }

  // ── что видит нынешний путь ───────────────────────────────────────────────
  const resumed = await second
    .request('session.resume', { session_id: storedId || sessionId, omit_messages: false })
    .catch((error) => ({ error: error.message }))

  console.log(`\n== нынешний путь: session.resume ==`)
  if (resumed?.error) {
    console.log(`  ОШИБКА: ${resumed.error}`)
    notes.push(`session.resume на этой сессии: ${resumed.error}`)
  } else {
    const messages = resumed.messages ?? []
    const assistant = messages.filter((message) => message?.role === 'assistant')
    const tail = assistant.at(-1)?.content ?? ''
    console.log(`  сообщений в истории: ${resumed.message_count ?? messages.length}`)
    console.log(`  ответов ассистента: ${assistant.length}`)
    console.log(`  длина последнего ответа: ${String(tail).length} символов`)
    notes.push(
      `resume отдал ${messages.length} сообщений; последний ответ ассистента — ${String(tail).length} символов`
    )
  }

  const stats = await second.request('session.events.stats', {}).catch(() => null)
  if (stats) console.log(`\nтелеметрия кольца: ${JSON.stringify(stats)}`)
} finally {
  if (second && sessionId) {
    await second.request('session.close', { session_id: sessionId }).catch(() => undefined)
    const rows = await second
      .request('session.list', { include_hidden: true })
      .catch(() => null)
    for (const row of rows?.sessions ?? []) {
      if (row.source !== 'probe') continue
      await second.request('session.delete', { session_id: row.id }).catch(() => undefined)
      console.log(`(проба за собой: ${row.id})`)
    }
  }
  first?.close()
  second?.close()
  stopServe(handle)
}

console.log(
  failures.length === 0
    ? `\nзамер выполнен:\n  ${notes.join('\n  ')}`
    : `\nЗАМЕР НЕ СОСТОЯЛСЯ (${failures.length}):\n  ${failures.join('\n  ')}`
)

process.exitCode = failures.length === 0 ? 0 : 1
