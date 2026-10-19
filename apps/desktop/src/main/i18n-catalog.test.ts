// Полнота каталога строк главного процесса (задача T27, часть 2).
//
// Типы уже не дают собрать `en` без ключа `ru`. Этот тест ловит то, чего типы не
// видят: строка-функция, в которой английский забыл подставить один из
// параметров (человек увидел бы «Ошибка (undefined)»), английская строка,
// оставшаяся русской, и русская, ушедшая в латиницу.

import { describe, expect, it } from 'vitest'

import { mainCatalog, type MainCatalogKey } from './i18n-catalog'

type Entry = string | ((...args: unknown[]) => string)

const ru = mainCatalog.ru as Record<string, Entry>
const en = mainCatalog.en as Record<string, Entry>
const CYRILLIC = /[А-Яа-яЁё]/

/** Метки вместо аргументов: по ним видно, использован ли каждый параметр. */
function probe(entry: Entry): { arity: number; marks: string[]; text: string } {
  if (typeof entry === 'string') return { arity: 0, marks: [], text: entry }
  const marks = Array.from({ length: entry.length }, (_, i) => `§${i}§`)
  return { arity: entry.length, marks, text: entry(...marks) }
}

describe('каталог главного процесса: en и ru согласованы (T27)', () => {
  const keys = Object.keys(ru)

  it('каталог не пуст — иначе проверка ничего не значит', () => {
    expect(keys.length).toBeGreaterThan(150)
  })

  it('наборы ключей совпадают в обе стороны', () => {
    expect(Object.keys(en).sort()).toEqual([...keys].sort())
  })

  it.each(keys)('%s: параметры те же, и каждый использован в обоих языках', (key) => {
    const r = probe(ru[key])
    const e = probe(en[key])
    expect(e.arity).toBe(r.arity)
    for (const mark of r.marks) {
      expect(r.text, `ru ${key} не использует ${mark}`).toContain(mark)
      expect(e.text, `en ${key} не использует ${mark}`).toContain(mark)
    }
  })

  it.each(keys)('%s: ru — по-русски, en — без кириллицы и не равен ru', (key) => {
    const r = probe(ru[key]).text
    const e = probe(en[key]).text
    expect(r, `ru ${key} без кириллицы`).toMatch(CYRILLIC)
    expect(e, `en ${key} содержит кириллицу`).not.toMatch(CYRILLIC)
    expect(e).not.toBe(r)
  })

  it('точка в конце и пробелы по краям не разошлись', () => {
    for (const key of keys) {
      const r = probe(ru[key]).text
      const e = probe(en[key]).text
      expect(e.endsWith('.'), `${key}: точка в конце`).toBe(r.endsWith('.'))
      expect(e.trim(), `${key}: пробелы по краям`).toBe(e)
    }
  })

  it('каждый код ошибки ssh имеет свой ключ', () => {
    // sshErrorMessage строит ключ из кода; типы проверяют это при сборке, но и
    // здесь полезно перечислить, что обязательно есть.
    const codes = [
      'auth-failed',
      'host-key-changed',
      'hermes-not-found',
      'timeout',
      'unreachable',
      'unsupported-platform',
      'update-required',
      'unknown'
    ]
    for (const code of codes) expect(keys).toContain(`ssh.error.${code}`)
  })

  it('тип ключа выводится из каталога', () => {
    const key: MainCatalogKey = 'common.noProject'
    expect(ru[key]).toBe('Нет открытого проекта')
  })
})
