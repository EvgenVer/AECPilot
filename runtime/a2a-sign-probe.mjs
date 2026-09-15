// Подпись исходящих уведомлений A2A: проверяет ли её получатель (задача 3.11).
//
// ЧТО ИМЕННО ЗАМЕРЯЕТСЯ. Ядро подписывает push-уведомления HMAC-SHA256 и кладёт
// подпись в заголовок `X-A2A-Signature` (plugins/platforms/a2a/security.py).
// Обещание задачи — «подпись проверяется ПОЛУЧАТЕЛЕМ»; получатель — чужая
// программа на чужом языке, и проверить она сможет только если договорённость
// однозначна: над какими байтами считается HMAC.
//
// Поэтому проба считает подпись ДВАЖДЫ: ядром (Python) и здесь (Node, node:crypto)
// — и сравнивает. Совпадение означает, что независимая реализация получателя
// придёт к тому же результату; расхождение означало бы, что «подпись есть», но
// проверить её нельзя, то есть её как бы и нет.
//
// ПОЧЕМУ БЕЗ СЕТИ. Ядро НАРОЧНО запрещает адреса обратного вызова на петлю и в
// частные сети (SSRF-защита в том же файле), поэтому «настоящий получатель» на
// 127.0.0.1 невозможен by design. Проба это тоже замеряет — чтобы никто не
// искал ошибку там, где стоит защита.

import { createHmac } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { HERMES_HOME_DIR, HERMES_SRC_DIR, PYTHON_BIN } from './hermes-env.mjs'

const SECRET = 'проба-secret-9f8e7d6c'

/** Полезная нагрузка нарочно с кириллицей, вложенностью и ключами не по
 * алфавиту: ядро сериализует с `sort_keys=True, ensure_ascii=False`, и обе
 * особенности обязаны совпасть у получателя. */
const PAYLOAD = {
  taskId: 'task-42',
  agent: 'AECPilot',
  результат: { статус: 'готово', 'строк «всего»': 3 },
  ts: '2026-08-22T00:00:00Z'
}

function fromCore() {
  const script = [
    'import json, os, sys',
    // 0.21.2 (задача 3.B4): `security.py` плагина теперь импортирует `gateway.*`,
    // а тот — `tools.*` ядра. Каталог плагина в `sys.path[0]` подменял бы `tools`
    // его же `tools.py` (циклический импорт) — поэтому импорт пакетом, как у ядра.
    'from plugins.platforms.a2a import security',
    'payload = json.loads(sys.argv[1])',
    'print(json.dumps({',
    '  "signature": security.sign_push_payload(payload),',
    '  "body": json.dumps(payload, sort_keys=True, ensure_ascii=False),',
    '  "blocked_loopback": security.is_safe_callback_url("http://127.0.0.1:9000/hook") if hasattr(security, "is_safe_callback_url") else None,',
    '  "blocked_private": security.is_safe_callback_url("http://192.168.1.10/hook") if hasattr(security, "is_safe_callback_url") else None,',
    '  "allowed_public": security.is_safe_callback_url("https://example.org/hook") if hasattr(security, "is_safe_callback_url") else None',
    '}))'
  ].join('\n')

  const run = spawnSync(PYTHON_BIN, ['-c', script, JSON.stringify(PAYLOAD)], {
    cwd: HERMES_SRC_DIR,
    encoding: 'utf-8',
    // HERMES_HOME — наш профиль, не умолчание ядра (D-86, см. tool-registry.mjs).
    env: { ...process.env, HERMES_HOME: HERMES_HOME_DIR, A2A_PUSH_SECRET: SECRET }
  })

  if (run.status !== 0) {
    console.error(run.stderr || run.stdout)
    throw new Error(`ядро не ответило (код ${run.status})`)
  }

  return JSON.parse(run.stdout.trim().split('\n').pop())
}

function fromReceiver(body) {
  return createHmac('sha256', SECRET).update(body, 'utf-8').digest('hex')
}

const core = fromCore()
const ours = fromReceiver(core.body)

console.log('== подпись исходящего уведомления A2A ==')
console.log(`тело (как его сериализует ядро): ${core.body}`)
console.log(`подпись ядра:      ${core.signature}`)
console.log(`подпись получателя: ${ours}`)
console.log(`СОВПАДАЮТ: ${core.signature === ours}`)
console.log('')
console.log('== адреса обратного вызова ==')
console.log(`петля (127.0.0.1) разрешена: ${core.blocked_loopback}`)
console.log(`частная сеть (192.168) разрешена: ${core.blocked_private}`)
console.log(`внешний адрес разрешён: ${core.allowed_public}`)

process.exitCode = core.signature === ours && core.signature !== '' ? 0 : 1
