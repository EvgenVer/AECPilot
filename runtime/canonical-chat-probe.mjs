// Схема постоянного чата, на которую встала задача 3.B2б, — против ЖИВОГО ядра.
//
// Зачем отдельная проба, когда есть юнит-тесты: они бьются о мок, а мок
// подтверждает ровно то, что в него положили. Поломка, ради которой эта задача
// и делалась, была молчаливой именно поэтому — `roster.test.ts` мокал поле
// `preferred_session`, которого в ядре больше нет, и оставался зелёным на
// сломанном коде. Четыре утверждения ниже мок проверить не может по построению.
//
// Проверяется:
//   1. `session.title` МАТЕРИАЛИЗУЕТ строку немедленно. Это несущее звено всей
//      схемы: `session.create` ленивый, строки в базе нет до первого сообщения,
//      и пока она не названа — реестра «Bot Chat» не существует.
//   2. Точный поиск `session.list` с `title` находит её, и `include_hidden`
//      для этого обязателен.
//   3. ПЕРЕИМЕНОВАНИЕ ОТКЛОНЯЕТСЯ. Ради этого свойства (#92473) и был отменён
//      наш собственный механизм опознания по метке источника: до 0.20.6 такой
//      защиты не было вовсе.
//   4. Второй `session.create` с тем же заголовком не заводит двойника, а
//      упирается в уникальность — то есть adopt-before-mint есть на чём строить.
//
// Прогонять при каждом подъёме пина: если отказ в переименовании исчезнет,
// заголовок перестанет быть личностью, и постоянные чаты снова начнут
// плодиться — молча.
//
// Usage: node runtime/canonical-chat-probe.mjs

import { startServe, waitHealthy, stopServe } from './serve.mjs'

const PORT = 18995
const RPC_TIMEOUT_MS = 60000
const TITLE = 'Bot Chat'

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

/** Реестровая строка — то, что ищет `findCanonicalChat` в `main/roster.ts`. */
async function findCanonical(rpc) {
  const answer = await rpc.request('session.list', { title: TITLE, include_hidden: true })
  const rows = answer?.sessions ?? []

  return (
    rows.find((row) => {
      const rootTitle = String(row.root_title ?? '').trim()
      const title = String(row.title ?? '').trim()
      return rootTitle === TITLE || (rootTitle === '' && title === TITLE)
    }) ?? null
  )
}

const handle = await startServe({ port: PORT })
let rpc
let created = ''
let stray = ''
let skipped = false
const failures = []

try {
  await waitHealthy(handle)
  rpc = await connect(handle)

  const existing = await findCanonical(rpc)
  if (existing) {
    console.log(
      `В профиле УЖЕ есть реестровая строка «${TITLE}» (${existing.id}) — проба её не трогает\n` +
        'и НИЧЕГО НЕ ПРОВЕРЯЕТ: чужой постоянный чат переименовывать нельзя даже ради\n' +
        'замера. Уберите её (или прогоните на чистом профиле) и повторите.'
    )
    skipped = true
  } else {
    // ── 1. создание в три шага ────────────────────────────────────────────
    const made = await rpc.request('session.create', { title: TITLE, hidden: true, source: 'probe' })
    created = made?.session_id ?? ''
    console.log(`1. session.create -> ${created || '(пусто)'}`)
    if (!created) throw new Error('ядро не вернуло сессию')

    const beforeTitle = await findCanonical(rpc)
    console.log(`   строка в реестре ДО session.title: ${beforeTitle ? 'есть' : 'НЕТ'}`)

    await rpc.request('session.title', { session_id: created, title: TITLE })
    const afterTitle = await findCanonical(rpc)
    console.log(`   строка в реестре ПОСЛЕ session.title: ${afterTitle ? 'есть' : 'НЕТ'}`)

    if (!afterTitle) {
      failures.push('session.title не материализовал строку — вся схема опознания стоит на этом')
    }

    // ЗАМЕР 2026-08-30: `session.title` заводит строку, но `pending_hidden` при
    // этом НЕ применяет — до явного вызова она видна в общем списке. Скрытость
    // здесь не косметика: защита заголовка от переименования включается только
    // у скрытой строки, поэтому третий шаг обязателен и проверяется отдельно.
    const beforeHide = await rpc.request('session.list', { title: TITLE })
    const visibleBeforeHide = (beforeHide?.sessions ?? []).some((row) => row.id === afterTitle?.id)
    console.log(`   видна в общем списке ДО session.set_hidden: ${visibleBeforeHide}`)

    await rpc.request('session.set_hidden', { session_id: created, hidden: true })

    // ── 2. скрытость: из ОБЫЧНОЙ выдачи ушла, точным поиском находится ────
    //
    // Проверять надо именно обычную выдачу. Ветка точного поиска (`title`)
    // показывает скрытые строки НАМЕРЕННО — «hidden rows still resolve
    // (canonical chats are always hidden)», иначе реестр не работал бы вовсе.
    // Проба на это уже попалась: считала видимость по тому же запросу, каким
    // ищет реестр, и объявляла провал там, где всё верно.
    const recents = await rpc.request('session.list', {})
    const inRecents = (recents?.sessions ?? []).some((row) => row.id === afterTitle?.id)
    console.log(`2. в обычной выдаче после скрытия: ${inRecents} (ожидается false)`)

    const byTitle = await findCanonical(rpc)
    console.log(`   точным поиском находится: ${Boolean(byTitle)} (ожидается true)`)
    console.log(`   поля реестровой строки: ${afterTitle ? Object.keys(afterTitle).join(', ') : '—'}`)

    if (inRecents) {
      failures.push('скрытая строка осталась в общем списке — скрытость не легла')
    }
    if (!byTitle) {
      failures.push('точный поиск перестал видеть скрытую строку — реестр так не работает')
    }

    // ── 3. отказ в переименовании ─────────────────────────────────────────
    // ИМЕННО RUNTIME-ИДЕНТИФИКАТОР. Реестровая строка несёт свой, durable, и на
    // нём `session.title` отвечает «session not found» — отказ, который легко
    // принять за защиту. Проба на это уже попалась 2026-08-30.
    const rename = await rpc
      .request('session.title', { session_id: created, title: 'Смета за март' })
      .then(() => null)
      .catch((error) => error.message)

    console.log(`3. переименование -> ${rename === null ? 'ПРОШЛО' : `отклонено: ${rename}`}`)
    if (rename === null) {
      failures.push(
        'переименование реестровой строки ПРОШЛО — защиты #92473 нет, ' +
          'заголовок больше не может быть личностью чата'
      )
    } else if (/not found/i.test(rename)) {
      failures.push(
        `отказ не про защиту, а «${rename}» — проба спросила не тот идентификатор ` +
          'и ничего не проверила'
      )
    }

    const stillThere = await findCanonical(rpc)
    console.log(`   строка на месте после попытки: ${stillThere ? 'да' : 'НЕТ'}`)
    if (!stillThere) failures.push('после попытки переименования реестровая строка исчезла')

    // ── 4. второй чат с тем же заголовком ─────────────────────────────────
    const twin = await rpc.request('session.create', { title: TITLE, hidden: true, source: 'probe' })
    stray = twin?.session_id ?? ''
    const twinTitled = await rpc
      .request('session.title', { session_id: stray, title: TITLE })
      .then(() => null)
      .catch((error) => error.message)

    console.log(`4. второй «${TITLE}» -> ${twinTitled === null ? 'ПРОШЁЛ' : `отклонён: ${twinTitled}`}`)
    if (twinTitled === null) {
      failures.push('второй чат с тем же заголовком прошёл — уникальность не держит реестр')
    }
  }

  console.log(
    skipped
      ? '\nСВЕРКА НЕ ВЫПОЛНЕНА — см. выше.'
      : failures.length === 0
        ? '\nсверка пройдена: заголовок материализует строку, ищется точно, ' +
          'переименованию не поддаётся и двойника не допускает'
        : `\nСВЕРКА ПРОВАЛЕНА (${failures.length}):\n  ${failures.join('\n  ')}`
  )
} finally {
  // УБОРКА ИДЁТ ПО DURABLE-ИДЕНТИФИКАТОРУ, а не по тому, что вернул
  // `session.create`. Runtime-идентификатор живёт в памяти процесса, и
  // `session.delete` на нём отвечает «session not found» — первый прогон пробы
  // на этом и оставил строку в профиле, после чего второй отказался работать.
  if (rpc) {
    // Закрывать надо по RUNTIME-идентификатору: durable ядро активной сессией не
    // считает, и `session.close` на нём молчит, а `session.delete` потом
    // отвечает «cannot delete an active session».
    for (const live of [created, stray].filter(Boolean)) {
      await rpc.request('session.close', { session_id: live }).catch(() => undefined)
    }

    const answer = await rpc
      .request('session.list', { title: TITLE, include_hidden: true })
      .catch(() => null)

    for (const row of answer?.sessions ?? []) {
      if (row.source !== 'probe') continue
      const removed = await rpc
        .request('session.delete', { session_id: row.id })
        .then(() => 'убрана')
        .catch((error) => `НЕ УБРАНА (${error.message})`)
      console.log(`(проба за собой: ${row.id} — ${removed})`)
    }
  }
  rpc?.close()
  stopServe(handle)
}

process.exitCode = skipped ? 2 : failures.length === 0 ? 0 : 1
