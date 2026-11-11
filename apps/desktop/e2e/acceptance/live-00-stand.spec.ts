// Проверка живого стенда (задача 3F.1): приложение само поднимает ядро во
// ВРЕМЕННОМ профиле (копия e2e-profile) на свободном порту, композер оживает,
// профиль разработчика не тронут, после прогона профиль и процессы убраны.
// Ходов модели здесь нет.

import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mainWindow, openProject, standFixture } from '../lib/app'
import { e2eProfileDir, PROFILE_PREFIX, profileGatewayEnsure } from '../lib/core'

const stand = standFixture({ mode: 'live', label: 'live-00-stand' })

test('живой стенд: ядро поднято во временном профиле, композер жив', async () => {
  const current = stand.get()
  expect(current.profileDir).toContain(PROFILE_PREFIX)
  expect(current.profileDir).not.toBe(e2eProfileDir)
  // Копия — целая: конфиг и ключ приехали файлами (содержимое не читается).
  expect(existsSync(join(current.profileDir!, 'config.yaml'))).toBe(true)
  expect(existsSync(join(current.profileDir!, '.env'))).toBe(true)
  expect(existsSync(join(current.profileDir!, 'serve.log'))).toBe(false)

  const page = await mainWindow(current)
  await openProject(current, page)

  // Журнал запуска пишется во временный профиль: шлюз поднят через `ensure`.
  const log = join(current.profileDir!, 'serve.log')
  expect(existsSync(log), 'serve.log должен появиться во временном профиле').toBe(true)
  expect(readFileSync(log, 'utf-8')).toMatch(/gateway ensure: exit 0/)
})

// Задача T53.2 (решение 0017): ядро приложения — единый шлюз, поднятый `gateway ensure`.
test('живой стенд: шлюз ядра работает во временном профиле и только на петле', async () => {
  const current = stand.get()
  const answer = profileGatewayEnsure(current.profileDir!)
  expect(answer.state).toBe('ready')
  const endpoint = answer.endpoint as { api_origin: string; profile_id: string }
  // C11: порты шлюза — только 127.0.0.1.
  expect(new URL(endpoint.api_origin).hostname).toBe('127.0.0.1')
  expect(endpoint.profile_id.toLowerCase()).toContain(PROFILE_PREFIX.toLowerCase())
})
