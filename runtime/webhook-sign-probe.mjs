// Проверяет ли ПОЛУЧАТЕЛЬ подпись исходящего вебхука (задачи 3.11, 3E.30).
//
// ЗАЧЕМ. Задача 3.11 обещает две вещи разом: подписанные исходящие вебхуки и
// A2A. Половина с A2A упёрлась в дефект ядра — оно подписывает одну строку, а
// отправляет другую (`a2a-push-probe.mjs`), и ждёт апстрима третий релиз
// подряд. Прежде чем держать вторую половину заложницей первой, надо ЗАМЕРИТЬ,
// один ли у них код подписи. Чтение говорит, что разный: вебхуки считают HMAC
// по ТЕМ ЖЕ БАЙТАМ, которые кладут в запрос (`agent/outbound_webhooks.py`,
// `_serialize_payload` → `_build_delivery` → `_deliver`). Чтение — не замер;
// эта проба делает то же, что сделает всякий приёмник: берёт пришедшее тело,
// считает по нему HMAC и сравнивает с заголовком.
//
// Отправляет САМО ЯДРО: цель регистрируется их же `register_from_config`,
// событие поднимается их же `invoke_hook`, доставку делает их фоновый поток.
// Наше здесь — только приёмник на 127.0.0.1 и арифметика проверки.
//
// Кириллица в теле НАРОЧНО: A2A ломается в том числе на ней (`ensure_ascii`),
// и договорённость, которая держится только на латинице, для нашего продукта
// не держится вовсе.
//
// Usage: node runtime/webhook-sign-probe.mjs

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

import { HERMES_HOME_DIR, HERMES_SRC_DIR, PYTHON_ARGS, PYTHON_BIN } from './hermes-env.mjs'

const SECRET = 'проба-outbound-4b3c2d1e'
const NOTE = 'Смета пересчитана: 3 позиции изменены.'

function startReceiver() {
  const received = []

  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push({
        signature: String(request.headers['x-hermes-signature-256'] ?? ''),
        event: String(request.headers['x-hermes-event'] ?? ''),
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

async function sendFromCore(url) {
  const script = [
    'import json, sys',
    'from agent import outbound_webhooks',
    'from hermes_cli.plugins import invoke_hook',
    '',
    'cfg = {"hooks": {"outbound": [{',
    '    "url": sys.argv[1],',
    '    "events": ["on_session_end"],',
    '    "secret": sys.argv[2],',
    '    "name": "probe",',
    '}]}}',
    'targets = outbound_webhooks.register_from_config(cfg)',
    'assert targets, "ядро не зарегистрировало исходящую цель"',
    '',
    '# Событие поднимается их же входом — путь целиком их, включая',
    '# сериализацию тела и постановку в очередь доставки.',
    'invoke_hook("on_session_end", session_id="sess-проба", note=sys.argv[3])',
    'flushed = outbound_webhooks.flush(15.0)',
    'print(json.dumps({"targets": len(targets), "flushed": bool(flushed)}))'
  ].join('\n')

  const child = spawn(PYTHON_BIN, [...PYTHON_ARGS, '-c', script, url, SECRET, NOTE], {
    cwd: HERMES_SRC_DIR,
    // Иначе Windows отдаёт stdout в кодировке консоли и кириллица в отчёте
    // превращается в мусор, а сравнивать надо ровно те же байты.
    // HERMES_HOME — наш профиль, не умолчание ядра (D-86, см. tool-registry.mjs).
    env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR, PYTHONIOENCODING: 'utf-8' }
  })

  let out = ''
  let err = ''
  child.stdout.on('data', (chunk) => (out += chunk.toString('utf-8')))
  child.stderr.on('data', (chunk) => (err += chunk.toString('utf-8')))

  const code = await new Promise((resolve) => child.on('close', resolve))
  if (code !== 0) {
    console.error(err || out)
    throw new Error(`ядро не отправило вебхук (код ${code})`)
  }

  return JSON.parse(out.trim().split('\n').pop())
}

const { server, received, port } = await startReceiver()

let sent
try {
  sent = await sendFromCore(`http://127.0.0.1:${port}/hook`)
} finally {
  server.close()
}

const problems = []
const got = received[0]

if (!got) {
  problems.push('вебхук до приёмника не доехал: сравнивать нечего')
} else {
  // Так и только так устроен всякий приёмник: у него есть заголовок и байты.
  const expected = 'sha256=' + createHmac('sha256', SECRET).update(got.body).digest('hex')
  const same =
    got.signature.length === expected.length &&
    timingSafeEqual(Buffer.from(got.signature), Buffer.from(expected))

  console.log('== что ушло по сети ==')
  console.log(`событие: ${got.event}; доставок принято: ${received.length}`)
  console.log(`тело (как отправлено): ${got.body.toString('utf-8')}`)
  console.log('')
  console.log('== проверка получателем ==')
  console.log(`подпись в заголовке:      ${got.signature}`)
  console.log(`HMAC по ПРИШЕДШЕМУ телу:  ${expected}`)
  console.log('')
  console.log(`получатель принимает вебхук: ${same}`)

  if (!same) {
    problems.push('подпись не сходится с пришедшим телом — тот же дефект, что у A2A')
  }
  if (!got.body.toString('utf-8').includes(NOTE)) {
    problems.push('кириллица не доехала как есть: тело подписано не в том виде, в каком отправлено')
  }
  if (!got.signature) {
    problems.push('подписи нет вовсе — обещание UR19 не выполняется')
  }
}

if (!sent?.flushed) problems.push('очередь доставки не опустела за 15 с')

if (problems.length > 0) {
  console.log('\n== ПРОБЛЕМЫ')
  for (const one of problems) console.log(`  ${one}`)
}
process.exitCode = problems.length > 0 ? 1 : 0
