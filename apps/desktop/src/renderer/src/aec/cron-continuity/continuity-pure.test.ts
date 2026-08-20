import { describe, expect, it } from 'vitest'

import { continuityUpdateFor, withContinuity } from './continuity-pure'

// Задача 3.5а. Общий переключатель обязан быть аккуратен с чужим значением:
// `context_from` в ядре — это и «свой прошлый вывод» (`self`), и цепочка
// «задача А готовит — задача Б разбирает» (id другой задачи). Тумблер про
// первое и не вправе ломать второе.

describe('withContinuity: что уезжает при создании задачи', () => {
  it('включено — проставляет self', () => {
    expect(withContinuity({ name: 'ночной перескан' }, true)).toEqual({
      name: 'ночной перескан',
      context_from: ['self']
    })
  })

  it('выключено — тело не трогает вовсе', () => {
    const body = { name: 'ночной перескан' }
    expect(withContinuity(body, false)).toBe(body)
  })

  it('чужую цепочку не переписывает даже при включённом тумблере', () => {
    const body = { name: 'разбор', context_from: ['a1b2c3d4e5f6'] }
    expect(withContinuity(body, true)).toBe(body)
  })

  it('не падает на теле, которого нет или которое не объект', () => {
    expect(withContinuity(undefined, true)).toBeUndefined()
    expect(withContinuity('строка', true)).toBe('строка')
    expect(withContinuity([1, 2], true)).toEqual([1, 2])
  })
})

describe('continuityUpdateFor: проход по уже заведённым задачам', () => {
  it('включение проставляет self задаче с пустым полем', () => {
    expect(continuityUpdateFor({}, true)).toEqual({ context_from: ['self'] })
    expect(continuityUpdateFor({ context_from: null }, true)).toEqual({ context_from: ['self'] })
    expect(continuityUpdateFor({ context_from: [] }, true)).toEqual({ context_from: ['self'] })
  })

  it('включение не трогает задачу, уже стоящую в цепочке', () => {
    expect(continuityUpdateFor({ context_from: ['a1b2c3d4e5f6'] }, true)).toBeNull()
  })

  it('включение не трогает задачу, где self уже стоит', () => {
    expect(continuityUpdateFor({ context_from: ['self'] }, true)).toBeNull()
  })

  it('выключение снимает только self', () => {
    expect(continuityUpdateFor({ context_from: ['self'] }, false)).toEqual({ context_from: null })
    expect(continuityUpdateFor({ context_from: ['SELF'] }, false)).toEqual({ context_from: null })
  })

  it('выключение НЕ снимает чужую ссылку — тумблер не про неё', () => {
    expect(continuityUpdateFor({ context_from: ['a1b2c3d4e5f6'] }, false)).toBeNull()
    expect(continuityUpdateFor({ context_from: ['self', 'a1b2c3d4e5f6'] }, false)).toBeNull()
  })

  it('выключение не трогает задачу с пустым полем', () => {
    expect(continuityUpdateFor({}, false)).toBeNull()
  })
})
