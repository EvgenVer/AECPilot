import { describe, expect, it } from 'vitest'

import {
  AUTOWRITE_FILE,
  decideNoteWrite,
  isNoteTarget,
  mergeBackgroundReview,
  NOTE_CONTENT_ERROR,
  NOTE_FILES,
  NOTE_LIMITS,
  NOTE_TARGET_ERROR,
  parseAutowrite,
  serializeAutowrite
} from './memory-notes-pure'

describe('какая записка', () => {
  it('знает ровно две стороны', () => {
    expect(isNoteTarget('memory')).toBe(true)
    expect(isNoteTarget('user')).toBe(true)
    expect(isNoteTarget('../../config.yaml')).toBe(false)
    expect(isNoteTarget('MEMORY.md')).toBe(false)
  })

  it('имена файлов — ядра, а не наши', () => {
    expect(NOTE_FILES).toEqual({ memory: 'MEMORY.md', user: 'USER.md' })
  })
})

describe('запись записки', () => {
  it('пропускает обычный текст и отдаёт имя файла', () => {
    const decision = decideNoteWrite('user', 'Ведёт раздел ОВ. Отвечать коротко.')

    expect(decision).toEqual({
      ok: true,
      file: 'USER.md',
      content: 'Ведёт раздел ОВ. Отвечать коротко.'
    })
  })

  it('приводит CRLF к переносам — файл читает python', () => {
    const decision = decideNoteWrite('memory', 'первая\r\nвторая\r\n')

    expect(decision).toEqual({ ok: true, file: 'MEMORY.md', content: 'первая\nвторая\n' })
  })

  it('отказывает неизвестной стороне — путь из окна не приходит', () => {
    expect(decideNoteWrite('../../../config.yaml', 'что угодно')).toEqual({
      ok: false,
      error: NOTE_TARGET_ERROR
    })
  })

  it('отказывает не-строке', () => {
    expect(decideNoteWrite('user', { content: 'нет' })).toEqual({
      ok: false,
      error: NOTE_CONTENT_ERROR
    })
  })

  it('отказывает записке длиннее предела ядра', () => {
    const tooLong = 'я'.repeat(NOTE_LIMITS.user + 1)
    const decision = decideNoteWrite('user', tooLong)

    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.error).toContain(String(NOTE_LIMITS.user))
    expect(decision.error, 'человеку надо знать, почему нельзя').toContain('каждый ход')
  })

  it('ровно предел — ещё можно', () => {
    expect(decideNoteWrite('memory', 'я'.repeat(NOTE_LIMITS.memory)).ok).toBe(true)
  })

  it('у двух записок РАЗНЫЕ пределы, как у ядра', () => {
    // Один предел на обе означал бы отказ там, где ядро пускает, и наоборот.
    expect(NOTE_LIMITS.memory).not.toBe(NOTE_LIMITS.user)
    expect(decideNoteWrite('memory', 'я'.repeat(NOTE_LIMITS.user + 1)).ok).toBe(true)
  })
})

describe('состояние автозаписи', () => {
  it('нет файла — автозапись включена (умолчание ядра)', () => {
    expect(parseAutowrite(null)).toEqual({ autowrite: true })
  })

  it('мусор в файле — тоже включена, а не выключена молча', () => {
    expect(parseAutowrite('{не json')).toEqual({ autowrite: true })
    expect(parseAutowrite('[]')).toEqual({ autowrite: true })
  })

  it('выключено читается как выключено', () => {
    expect(parseAutowrite('{"autowrite": false}')).toEqual({ autowrite: false })
  })

  it('круг чтения и записи сходится', () => {
    expect(parseAutowrite(serializeAutowrite({ autowrite: false }))).toEqual({ autowrite: false })
    expect(AUTOWRITE_FILE.endsWith('.json')).toBe(true)
  })
})

describe('фоновый разбор в конфиге ядра', () => {
  it('создаёт секцию, когда её нет, не тронув чужие ключи', () => {
    const text = mergeBackgroundReview('model:\n  default: gpt-5-mini\n', false)

    expect(text).toContain('background_review:\n  enabled: false\n')
    expect(text).toContain('default: gpt-5-mini')
  })

  it('переписывает существующее значение, а не добавляет второе', () => {
    const before = 'background_review:\n  enabled: true\n  interval: 3\n'
    const text = mergeBackgroundReview(before, false)

    expect(text).toContain('  enabled: false')
    expect(text).not.toContain('  enabled: true')
    expect(text, 'соседний ключ секции не наш').toContain('  interval: 3')
  })

  it('возвращает обратно — переключатель работает в две стороны', () => {
    const off = mergeBackgroundReview('background_review:\n  enabled: true\n', false)

    expect(mergeBackgroundReview(off, true)).toContain('  enabled: true')
  })

  it('не трогает следующую секцию верхнего уровня', () => {
    const before = 'background_review:\n  enabled: true\nmemory:\n  provider: mem0\n'
    const text = mergeBackgroundReview(before, false)

    expect(text).toContain('memory:\n  provider: mem0')
    expect(text.indexOf('enabled: false')).toBeLessThan(text.indexOf('memory:'))
  })
})
