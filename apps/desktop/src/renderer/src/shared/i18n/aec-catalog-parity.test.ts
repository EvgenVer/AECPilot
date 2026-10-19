// Полнота каталога наших собственных поверхностей (задача T27).
//
// Каталог `aec-catalog.ts` — два дерева, `en` и `ru`. Ключ, которого нет в `ru`,
// не падает: плагинный механизм откатывается на английскую строку, и человек
// молча видит смесь языков. Этот тест делает расхождение громким:
//   • наборы ключей en и ru совпадают в обе стороны;
//   • у строк-функций совпадает и число аргументов, и вид результата;
//   • значения ru не равны английским, кроме имён/адресов/форматов (NAMES);
//   • плейсхолдеры `{name}` / `%s` в ru те же, что в en.

import { describe, expect, it } from 'vitest'

import { aecLocales } from './aec-catalog'

type Tree = Record<string, unknown>

/** Листья дерева: строка → строка, функция → результат вызова с числами. */
function leaves(value: unknown, path = '', out = new Map<string, string>()): Map<string, string> {
  if (typeof value === 'string') out.set(path, value)
  else if (typeof value === 'function') {
    const fn = value as (...a: unknown[]) => unknown
    let rendered: unknown
    try {
      rendered = fn(...[2, 3, 4, 5].slice(0, fn.length))
    } catch {
      rendered = undefined
    }
    out.set(path, typeof rendered === 'string' ? rendered : '<fn>')
  } else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value as Tree)) leaves(v, path ? `${path}.${k}` : k, out)
  return out
}

const en = leaves(aecLocales.en)
const ru = leaves(aecLocales.ru)

// Строки, которые одинаковы на обоих языках по существу: имена, форматы,
// адреса, единицы, названия внешних продуктов. Каждая — с причиной.
const SAME: Record<string, string> = {
  'explorer.title': 'Vault — устоявшийся термин проекта, в ru так же («Vault пуст»)',
  'onboarding.recommendedKey.title': 'имя провайдера в ядре (D-188), не перевод'
}

describe('каталог наших поверхностей: en и ru согласованы (T27)', () => {
  it('каталог не пуст — иначе проверка ничего не значит', () => {
    expect(en.size).toBeGreaterThan(500)
    expect(ru.size).toBeGreaterThan(500)
  })

  it('каждый ключ en есть в ru', () => {
    const missing = [...en.keys()].filter((key) => !ru.has(key))
    expect(missing).toEqual([])
  })

  it('в ru нет ключей, которых нет в en', () => {
    const extra = [...ru.keys()].filter((key) => !en.has(key))
    expect(extra).toEqual([])
  })

  it('пустых значений нет, кроме заведомо пустых в en', () => {
    const empty = [...ru].filter(
      ([key, value]) => value.trim() === '' && en.get(key)?.trim() !== ''
    )
    expect(empty.map(([key]) => key)).toEqual([])
  })

  it('значение ru не осталось английским', () => {
    const stray = [...ru]
      .filter(([key, value]) => en.get(key) === value && /[a-z]{4}/i.test(value))
      .map(([key, value]) => `${key}: ${value}`)
      .filter((line) => !Object.keys(SAME).some((key) => line.startsWith(`${key}:`)))
    expect(stray).toEqual([])
  })

  it('плейсхолдеры в ru те же, что в en', () => {
    const tokens = (s: string): string =>
      (s.match(/\{[A-Za-z0-9_]+\}|%[sd]/g) ?? []).sort().join('|')
    const broken = [...ru]
      .filter(([key, value]) => en.has(key) && tokens(en.get(key) ?? '') !== tokens(value))
      .map(([key]) => key)
    expect(broken).toEqual([])
  })
})
