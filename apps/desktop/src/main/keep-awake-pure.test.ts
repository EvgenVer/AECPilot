import { describe, expect, test } from 'vitest'
import {
  decidePowerSave,
  keepAwakeWanted,
  parseKeepAwakeJson,
  parseKeepAwakeMode,
  serializeKeepAwake
} from './keep-awake-pure'

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
  test('файл до 0.22 со «включено» читается как «всегда»', () => {
    expect(parseKeepAwakeJson('{"keepAwake": true}')).toBe('always')
  })

  test('сохранённый режим читается', () => {
    expect(parseKeepAwakeJson('{"mode": "while-working"}')).toBe('while-working')
    expect(parseKeepAwakeJson('{"mode": "off"}')).toBe('off')
  })

  test('всё остальное читается как «выключено»', () => {
    for (const text of [
      '{"keepAwake": false}',
      '{"keepAwake": "true"}',
      '{"keepAwake": 1}',
      '{"mode": "sometimes"}',
      '{}',
      '[]',
      'null',
      'не json',
      ''
    ]) {
      expect(parseKeepAwakeJson(text), text).toBe('off')
    }
  })

  test('запись и чтение сходятся для каждого режима', () => {
    for (const mode of ['off', 'while-working', 'always'] as const) {
      expect(parseKeepAwakeJson(serializeKeepAwake(mode))).toBe(mode)
    }
  })
})

// Задача T20.7: их окно с 0.22.2 шлёт строку режима туда, где мы ждали булево.
describe('parseKeepAwakeMode', () => {
  test('строка «off» — это выключено, а не истинное значение', () => {
    expect(parseKeepAwakeMode('off')).toBe('off')
  })

  test('прежнее булево переводится в режим', () => {
    expect(parseKeepAwakeMode(true)).toBe('always')
    expect(parseKeepAwakeMode(false)).toBe('off')
  })

  test('не режим — null, и прежнее состояние не трогается', () => {
    for (const value of ['on', 1, null, undefined, {}]) expect(parseKeepAwakeMode(value)).toBeNull()
  })
})

describe('keepAwakeWanted', () => {
  test('«пока работает» держит машину только во время хода', () => {
    expect(keepAwakeWanted('while-working', true)).toBe(true)
    expect(keepAwakeWanted('while-working', false)).toBe(false)
  })

  test('«всегда» и «никогда» от хода не зависят', () => {
    expect(keepAwakeWanted('always', false)).toBe(true)
    expect(keepAwakeWanted('off', true)).toBe(false)
  })
})
