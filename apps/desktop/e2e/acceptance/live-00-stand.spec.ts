// Проверка живого стенда (задача 3F.1): приложение само поднимает ядро во
// ВРЕМЕННОМ профиле (копия dev-profile) на свободном порту, композер оживает,
// профиль разработчика не тронут, после прогона профиль и процессы убраны.
// Ходов модели здесь нет.

import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mainWindow, openProject, standFixture } from '../lib/app'
import { devProfileDir, PROFILE_PREFIX } from '../lib/core'

const stand = standFixture({ mode: 'live', label: 'live-00-stand' })

/** Живые процессы ядра с профилем в командной строке. */
function hermesProcessesWith(fragment: string): number[] {
  if (process.platform !== 'win32') return []
  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='hermes.exe' OR Name='python.exe'\" | " +
          'Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
      ],
      { encoding: 'utf8' }
    )
    const parsed: unknown = JSON.parse(output.trim() || 'null')
    const rows = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return rows
      .filter((row) =>
        String((row as { CommandLine?: string }).CommandLine ?? '').includes(fragment)
      )
      .map((row) => Number((row as { ProcessId: number }).ProcessId))
  } catch {
    return []
  }
}

test('живой стенд: ядро поднято во временном профиле, композер жив', async () => {
  const current = stand.get()
  expect(current.profileDir).toContain(PROFILE_PREFIX)
  expect(current.profileDir).not.toBe(devProfileDir)
  // Копия — целая: конфиг и ключ приехали файлами (содержимое не читается).
  expect(existsSync(join(current.profileDir!, 'config.yaml'))).toBe(true)
  expect(existsSync(join(current.profileDir!, '.env'))).toBe(true)
  expect(existsSync(join(current.profileDir!, 'serve.log'))).toBe(false)

  const page = await mainWindow(current)
  await openProject(current, page)

  // Ядро слушает НАШ порт, журнал ядра пишется во временный профиль.
  const log = join(current.profileDir!, 'serve.log')
  expect(existsSync(log), 'serve.log должен появиться во временном профиле').toBe(true)
  expect(readFileSync(log, 'utf-8')).toContain(`port=${current.servePort}`)
})

test('живой стенд: процесс ядра идёт с временным профилем', async () => {
  const current = stand.get()
  // Командная строка `hermes serve --port <наш порт>`: ядро — то, что поднял
  // именно этот стенд, а не приложение разработчика рядом.
  expect(hermesProcessesWith(`--port ${current.servePort}`).length).toBeGreaterThan(0)
})
