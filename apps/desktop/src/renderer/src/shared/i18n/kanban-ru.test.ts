// Русский каталог плагина «Канбан» полон и действительно русский (задача T27).
//
// Полноту ключей держит и компилятор (на стороне донора `ru` присвоен их типу),
// но тип не видит строку, которую забыли перевести и оставили английской, и не
// видит смысловой ошибки в форме числа. Этот тест читает собранную таблицу
// локалей плагина — ту самую, что регистрируется при загрузке.

import { describe, expect, it } from 'vitest'

import { KANBAN_LOCALES } from '../../donor/plugins/kanban/i18n'

function leaves(value: unknown, path = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') out.set(path, value)
  else if (typeof value === 'function') {
    const fn = value as (...a: unknown[]) => unknown
    const rendered = fn(...[2, 3, 4].slice(0, fn.length))
    out.set(path, typeof rendered === 'string' ? rendered : '<fn>')
  } else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out)
  return out
}

const en = leaves(KANBAN_LOCALES.en)
const ru = leaves(KANBAN_LOCALES.ru)

// Слова, которые одинаковы на обоих языках по существу: имена, адреса, команды,
// примеры ввода. Каждое — с причиной.
const SAME: Record<string, string> = {
  skillsPlaceholder: 'пример ввода (имена навыков)',
  projectHintCmd: 'команда, которую печатают в терминале',
  slug: 'формат «slug: …» — технический идентификатор'
}

describe('русский каталог канбана', () => {
  it('таблица локалей плагина содержит русский', () => {
    expect(KANBAN_LOCALES.ru).toBeDefined()
    expect(en.size).toBeGreaterThan(200)
  })

  it('набор ключей совпадает с английским в обе стороны', () => {
    expect([...en.keys()].filter((key) => !ru.has(key))).toEqual([])
    expect([...ru.keys()].filter((key) => !en.has(key))).toEqual([])
  })

  it('ни одна строка не осталась английской', () => {
    const stray = [...ru]
      .filter(([key, value]) => en.get(key) === value && /[a-z]{3}/i.test(value))
      .map(([key, value]) => `${key}: ${value}`)
      .filter((line) => !Object.keys(SAME).some((key) => line.startsWith(`${key}:`)))
    expect(stray).toEqual([])
  })
})
