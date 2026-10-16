// Задача 3.6а. Проверяется одно: испорченный файл настройки не должен молча
// поднять фоновый процесс.

import { describe, expect, it } from 'vitest'

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  cronRunnerSpawnEnv,
  parseCronRunnerPref,
  serializeCronRunnerPref
} from './cron-runner-pure'

describe('сохранённый выбор «запускать задачи по расписанию»', () => {
  it('записанное читается обратно', () => {
    expect(parseCronRunnerPref(serializeCronRunnerPref(true))).toBe(true)
    expect(parseCronRunnerPref(serializeCronRunnerPref(false))).toBe(false)
  })

  it('испорченный файл — выключено', () => {
    expect(parseCronRunnerPref('{')).toBe(false)
    expect(parseCronRunnerPref('null')).toBe(false)
    expect(parseCronRunnerPref('')).toBe(false)
  })

  it('включено — только при явном true, а не при «похоже на да»', () => {
    expect(parseCronRunnerPref('{"enabled":"yes"}')).toBe(false)
    expect(parseCronRunnerPref('{"enabled":1}')).toBe(false)
    expect(parseCronRunnerPref('{"enabled":true}')).toBe(true)
  })
})

describe('cronRunnerSpawnEnv (3F.D1, D-136)', () => {
  it('ticks every profile — specialists keep their routines in their own profiles', () => {
    const env = cronRunnerSpawnEnv({ PATH: 'x', OTHER: '1' }, '/home/p')

    expect(env.GATEWAY_MULTIPLEX_PROFILES).toBe('true')
    expect(env.HERMES_HOME).toBe('/home/p')
    expect(env.MEM0_TELEMETRY).toBe('false')
    expect(env.MEM0_DIR).toBe(join('/home/p', 'mem0'))
    expect(env.PATH).toBe('x')
    expect(env.OTHER).toBe('1')
  })

  it('wins over an inherited value', () => {
    expect(
      cronRunnerSpawnEnv({ GATEWAY_MULTIPLEX_PROFILES: 'false' }, '/h').GATEWAY_MULTIPLEX_PROFILES
    ).toBe('true')
  })

  // D-164: общий с отдельным Hermes каталог блокировок гасил наш планировщик.
  it('keeps gateway locks inside the profile, the same dir serve uses', async () => {
    const specifier = pathToFileURL(
      join(__dirname, '..', '..', '..', '..', 'runtime', 'hermes-env.mjs')
    )
    const { gatewayLockDir } = (await import(/* @vite-ignore */ specifier.href)) as {
      gatewayLockDir: (home: string) => string
    }
    const env = cronRunnerSpawnEnv({ HERMES_GATEWAY_LOCK_DIR: '/shared' }, '/home/p')

    expect(env.HERMES_GATEWAY_LOCK_DIR).toBe(gatewayLockDir('/home/p'))
  })
})
