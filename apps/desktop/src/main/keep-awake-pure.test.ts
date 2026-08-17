import { describe, expect, test } from 'vitest'
import { decidePowerSave, parseKeepAwakeJson, serializeKeepAwake } from './keep-awake-pure'

/**
 * Task 3.18. The failure mode worth pinning is not "it did not work" but "it
 * kept working after being turned off": a leaked blocker keeps a laptop awake
 * all night with nothing on screen to explain it.
 */

describe('decidePowerSave', () => {
  test('включение без держателя — запускаем', () => {
    expect(decidePowerSave(true, null)).toBe('start')
  })

  test('повторное включение не заводит второй держатель', () => {
    expect(decidePowerSave(true, 7)).toBe('none')
  })

  test('выключение отпускает held-блокировку', () => {
    expect(decidePowerSave(false, 7)).toBe('stop')
  })

  test('выключение без держателя ничего не делает', () => {
    expect(decidePowerSave(false, null)).toBe('none')
  })

  test('идентификатор 0 — валидный держатель, а не «нет держателя»', () => {
    // Electron нумерует блокировки с нуля, и проверка на истинность здесь
    // означала бы утечку ровно первой из них.
    expect(decidePowerSave(true, 0)).toBe('none')
    expect(decidePowerSave(false, 0)).toBe('stop')
  })
})

describe('parseKeepAwakeJson', () => {
  test('сохранённое «включено» читается', () => {
    expect(parseKeepAwakeJson('{"keepAwake": true}')).toBe(true)
  })

  test('всё остальное читается как «выключено»', () => {
    for (const text of [
      '{"keepAwake": false}',
      '{"keepAwake": "true"}',
      '{"keepAwake": 1}',
      '{}',
      '[]',
      'null',
      'не json',
      ''
    ]) {
      expect(parseKeepAwakeJson(text), text).toBe(false)
    }
  })

  test('запись и чтение сходятся', () => {
    expect(parseKeepAwakeJson(serializeKeepAwake(true))).toBe(true)
    expect(parseKeepAwakeJson(serializeKeepAwake(false))).toBe(false)
  })
})
