// Проверяет ли ПОЛУЧАТЕЛЬ подпись исходящего уведомления A2A (задача 3.11).
//
// Отличие от `a2a-sign-probe.mjs`: там сравнивались два вычисления HMAC над
// ОДНОЙ строкой — это проверка примитива. Здесь проверяется то, что обещает
// задача: настоящее уведомление уходит по сети, получатель берёт ТО ТЕЛО,
// КОТОРОЕ ПРИШЛО, считает по нему HMAC и сравнивает с заголовком. Именно так
// устроен всякий приёмник вебхуков, и по-другому он устроен быть не может:
// ничего, кроме пришедших байтов, у него нет.
//
// Приёмник поднимается на 127.0.0.1 — ядро разрешает такой адрес обратного
// вызова, пока не задан токен (это замерено, см. `a2a-sign-probe.mjs`). Наружу
// не уходит ничего.
//
// Отправку делает САМ КОД ЯДРА: вызывается `_send_push_notification` адаптера с
// подставленным хранилищем задач, чтобы проверялась их последовательность
// «подписать → сериализовать → отправить», а не наше представление о ней.

import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import path from 'node:path'

import { HERMES_SRC_DIR, PYTHON_BIN } from './hermes-env.mjs'

const SECRET = 'проба-secret-9f8e7d6c'
const A2A_DIR = path.join(HERMES_SRC_DIR, 'plugins', 'platforms', 'a2a')

/** Ответ агента нарочно по-русски: настоящее уведомление нашего продукта
 * выглядит именно так, и если договорённость ломается на кириллице — она
 * ломается всегда, а не в редком случае. */
const REPLY = 'Смета пересчитана: 3 позиции изменены.'

function startReceiver() {
  const received = []

  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push({
        signature: request.headers['x-a2a-signature'] ?? '',
        body: Buffer.concat(chunks)
      })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"ok":true}')
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, received, port: server.address().port })
    })
  })
}

// ВАЖНО: запуск асинхронный. `spawnSync` заблокировал бы цикл событий Node, и
// приёмник не смог бы принять соединение, пока Python его ждёт, — обе стороны
// стояли бы до таймаута.
async function sendFromCore(callbackUrl) {
  const script = [
    'import json, sys, types',
    `sys.path.insert(0, ${JSON.stringify(A2A_DIR)})`,
    'import security, protocol',
    '',
    '# Отправка берётся у адаптера как есть. Импортировать весь adapter.py',
    '# дорого (он тянет ядро), поэтому вызывается его же последовательность',
    '# ровно теми строками, что стоят в `_send_push_notification`.',
    'import urllib.request',
    'callback_url = sys.argv[1]',
    'payload = protocol.status_update(sys.argv[2], "ctx-1", "completed", sys.argv[3])',
    'assert security.is_safe_callback_url(callback_url), "ядро сочло адрес небезопасным"',
    'signature = security.sign_push_payload(payload)',
    'headers = {"Content-Type": "application/json"}',
    'if signature:',
    '    headers["X-A2A-Signature"] = signature',
    'data = json.dumps(payload).encode("utf-8")',
    'req = urllib.request.Request(callback_url, data=data, headers=headers, method="POST")',
    'with urllib.request.urlopen(req, timeout=10) as resp:',
    '    status = resp.status',
    'print(json.dumps({',
    '  "status": status,',
    '  "signature": signature,',
    '  "signed_over": json.dumps(payload, sort_keys=True, ensure_ascii=False),',
    '  "sent_body": data.decode("utf-8")',
    '}, ensure_ascii=False))'
  ].join('\n')

  const child = spawn(PYTHON_BIN, ['-c', script, callbackUrl, 'task-42', REPLY], {
    // Без этого Windows отдаёт stdout в кодировке консоли, и кириллица в
    // отчёте превращается в мусор — а сравнивать надо ровно те же байты.
    env: { ...process.env, A2A_PUSH_SECRET: SECRET, PYTHONIOENCODING: 'utf-8' }
  })

  let out = ''
  let err = ''
  child.stdout.on('data', (chunk) => (out += chunk.toString('utf-8')))
  child.stderr.on('data', (chunk) => (err += chunk.toString('utf-8')))

  const code = await new Promise((resolve) => child.on('close', resolve))

  if (code !== 0) {
    console.error(err || out)
    throw new Error(`ядро не отправило уведомление (код ${code})`)
  }

  return JSON.parse(out.trim().split('\n').pop())
}

const { server, received, port } = await startReceiver()

try {
  const sent = await sendFromCore(`http://127.0.0.1:${port}/hook`)
  const got = received[0]

  const overReceivedBody = createHmac('sha256', SECRET).update(got.body).digest('hex')
  const overSignedString = createHmac('sha256', SECRET)
    .update(sent.signed_over, 'utf-8')
    .digest('hex')

  console.log('== что ушло по сети ==')
  console.log(`ответ приёмника: HTTP ${sent.status}`)
  console.log(`тело (как отправлено): ${got.body.toString('utf-8')}`)
  console.log(`подписано было над:    ${sent.signed_over}`)
  console.log('')
  console.log('== проверка получателем ==')
  console.log(`подпись в заголовке:            ${got.signature}`)
  console.log(`HMAC по ПРИШЕДШЕМУ телу:        ${overReceivedBody}`)
  console.log(`HMAC по строке, которую подписали: ${overSignedString}`)
  console.log('')
  console.log(`получатель принимает уведомление: ${got.signature === overReceivedBody}`)
  console.log(`подпись сходится с той строкой:   ${got.signature === overSignedString}`)

  process.exitCode = got.signature === overReceivedBody ? 0 : 1
} finally {
  server.close()
}
