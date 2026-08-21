// Задача 3.6а. Проверяется одно: испорченный файл настройки не должен молча
// поднять фоновый процесс.

import { describe, expect, it } from 'vitest'

import { parseCronRunnerPref, serializeCronRunnerPref } from './cron-runner-pure'

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
