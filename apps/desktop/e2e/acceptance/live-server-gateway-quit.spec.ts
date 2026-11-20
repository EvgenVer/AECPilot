// Задача T53.4, находка обзора: выход из сервера, пока его единый шлюз ещё поднимается
// (`gateway ensure` идёт до минуты на холодном старте), не должен оставить ни шлюза, ни
// `hermes serve`, запущенного уже после выхода. Бесплатно: модель не вызывается.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { standFixture } from '../lib/app'

const stand = standFixture({ mode: 'live', label: 'live-server-gateway-quit', args: ['--server'] })

function serveLog(): string {
  const file = join(stand.get().profileDir!, 'serve.log')
  return existsSync(file) ? readFileSync(file, 'utf-8') : ''
}

function portListening(port: number): boolean {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `[bool](Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue)`
    ],
    { encoding: 'utf-8' }
  ).trim()
  return out === 'True'
}

/** A `hermes gateway ensure` process is running (live specs run one worker at a time). */
function ensureRunning(): boolean {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      "[bool](Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -match 'gateway\\s+ensure' })"
    ],
    { encoding: 'utf-8' }
  ).trim()
  return out === 'True'
}

test('выход во время подъёма шлюза: ни шлюза, ни serve после выхода', async () => {
  // Выход — когда `ensure` уже идёт (или только что закончился — тоже годится). Сразу после
  // запуска нельзя: главный процесс ещё готовит профиль и до `ensure` не дошёл, выход тогда
  // проверяет не то (2026-11-20: так спека падала три раза из трёх).
  await expect
    .poll(() => ensureRunning() || /gateway ensure: exit/.test(serveLog()), {
      timeout: 120000,
      intervals: [200]
    })
    .toBe(true)
  const ensuringAtQuit = !/gateway ensure: exit/.test(serveLog())
  await stand.get().app.close()

  const log = serveLog()
  console.log(`шлюз поднимался в момент выхода: ${ensuringAtQuit}\n${log}`)
  expect(log, 'шлюз остановлен при выходе').toMatch(/gateway stop: exit 0/)

  // `serve` не должен появиться после выхода: подождать столько, сколько шёл бы его
  // запуск, и проверить, что порт свободен.
  await new Promise((resolve) => setTimeout(resolve, 15000))
  expect(portListening(stand.get().servePort!), 'порт serve свободен').toBe(false)
  const stop = log.lastIndexOf('gateway stop:')
  const lastServe = serveLog().lastIndexOf('starting hermes serve')
  if (lastServe > stop) {
    expect(serveLog().slice(lastServe), 'serve, запущенный после выхода, остановлен').toMatch(
      /hermes serve exited/
    )
  }
})
