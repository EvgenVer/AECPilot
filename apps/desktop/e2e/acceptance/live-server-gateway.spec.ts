// Задача T53.4 (решение 0017): роль «сервер» на 0.2. Приложение с ключом `--server`
// поднимает единый шлюз ядра (`gateway ensure`) и рядом `serve` с постоянным токеном.
// Клиент ходит к `serve` (на сервере — по SSH-туннелю, здесь — по петлевому порту), а
// `serve` пересылает шлюзу вызовы групповых комнат (замер T50, шаг B). При выходе
// сервер останавливает оба процесса.
//
// Бесплатно: модель не вызывается. Профиль — временная копия e2e-profile.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { standFixture } from '../lib/app'
import { profileGatewayEnsure } from '../lib/core'

test.describe.configure({ mode: 'serial' })

const stand = standFixture({ mode: 'live', label: 'live-server-gateway', args: ['--server'] })

let gatewayPid = 0

function serveLog(): string {
  const file = join(stand.get().profileDir!, 'serve.log')
  return existsSync(file) ? readFileSync(file, 'utf-8') : ''
}

function pidListeningOn(port: number): number {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`
    ],
    { encoding: 'utf-8' }
  ).trim()
  return Number(out)
}

function processAlive(pid: number): boolean {
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `[bool](Get-Process -Id ${pid} -ErrorAction SilentlyContinue)`],
    { encoding: 'utf-8' }
  ).trim()
  return out === 'True'
}

/** Постоянный токен сервера — внутри его же процесса (safeStorage); нигде не печатается. */
async function serverToken(): Promise<string> {
  return stand.get().app.evaluate(({ app, safeStorage }) => {
    const fs = process.getBuiltinModule('node:fs')
    const path = process.getBuiltinModule('node:path')
    const stored = JSON.parse(
      fs.readFileSync(path.join(app.getPath('userData'), 'server-token.json'), 'utf8')
    ) as { encoding: string; token: string }
    return stored.encoding === 'safe'
      ? safeStorage.decryptString(Buffer.from(stored.token, 'base64'))
      : ''
  })
}

/** Один вызов JSON-RPC к `serve` тем же сокетом, каким ходит клиент. */
async function serveCall(
  token: string,
  method: string,
  params: Record<string, unknown> = {}
): Promise<{ result?: Record<string, unknown>; error?: unknown }> {
  const port = stand.get().servePort!
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(token)}`)
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method}: нет ответа за 30 с`)), 30000)
      ws.addEventListener('error', () => reject(new Error('сокет serve не открылся')))
      ws.addEventListener('open', () =>
        ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }))
      )
      ws.addEventListener('message', (message) => {
        const frame = JSON.parse(String(message.data)) as {
          id?: number
          result?: Record<string, unknown>
          error?: unknown
        }
        if (frame.id !== 1) return
        clearTimeout(timer)
        resolve({ result: frame.result, error: frame.error })
      })
    })
  } finally {
    ws.close()
  }
}

test('сервер поднял единый шлюз ядра — только на петле', async () => {
  await expect
    .poll(serveLog, { timeout: 180000, intervals: [2000], message: 'gateway ensure в serve.log' })
    .toMatch(/gateway ensure: exit 0/)

  const answer = profileGatewayEnsure(stand.get().profileDir!)
  expect(answer.state).toBe('ready')
  const origin = new URL((answer.endpoint as { api_origin: string }).api_origin)
  expect(origin.hostname, 'C11: шлюз только на 127.0.0.1').toBe('127.0.0.1')
  gatewayPid = pidListeningOn(Number(origin.port))
  expect(gatewayPid, 'процесс шлюза найден по его порту').toBeGreaterThan(0)
})

test('клиент с токеном сервера видит комнаты — их ведёт шлюз через serve', async () => {
  const token = await serverToken()
  expect(token, 'постоянный токен сервера').toMatch(/^[0-9a-f]{32,}$/)

  // Своё у `serve` — RoomLink включён; ответ шлюза — RoomLink выключен с причиной
  // `canonical_driver_required` (замер T50, шаг B). Пересылка включается ≈12 с спустя
  // после готовности шлюза. `serve` сервер поднимает после шлюза — первые попытки могут
  // не застать сокет открытым.
  await expect
    .poll(
      async () => {
        try {
          const caps = await serveCall(token, 'groups.capabilities')
          const roomLink = caps.result?.room_link as { reason?: string } | undefined
          return roomLink?.reason ?? JSON.stringify(caps.error ?? caps.result).slice(0, 200)
        } catch (error) {
          return String(error)
        }
      },
      { timeout: 240000, intervals: [3000], message: 'serve пересылает комнаты шлюзу' }
    )
    .toBe('canonical_driver_required')

  const list = await serveCall(token, 'groups.list')
  expect(list.error, 'список комнат через serve').toBeUndefined()
})

test('выход сервера останавливает шлюз (gateway stop), а не оставляет сироту', async () => {
  expect(gatewayPid).toBeGreaterThan(0)
  await stand.get().app.close()

  expect(serveLog()).toMatch(/gateway stop: exit 0/)
  // `serve` сервера тоже остановлен: его порт свободен.
  await expect
    .poll(() => pidListeningOn(stand.get().servePort!), {
      timeout: 60000,
      message: 'порт serve освобождён'
    })
    .toBe(0)
  await expect
    .poll(() => processAlive(gatewayPid), { timeout: 60000, message: 'процесс шлюза завершён' })
    .toBe(false)
})
