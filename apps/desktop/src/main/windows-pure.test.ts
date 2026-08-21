// Задача 3.14. Проверяется то, что видно только по адресу окна: их флаги стоят
// ДО решётки (иначе рендерер их не прочитает), а испорченный номер сессии не
// превращается молча во второе главное окно.

import { describe, expect, it } from 'vitest'

import { planAppWindow, planSessionWindow, SECONDARY_WINDOW_FLAG, windowUrl } from './windows-pure'

describe('второе полноценное окно', () => {
  it('без флагов — это то же приложение', () => {
    expect(planAppWindow()).toEqual({ query: {}, hash: '' })
  })
})

describe('окно одной сессии', () => {
  it('несёт их флаг и маршрут сессии', () => {
    expect(planSessionWindow('s-42')).toEqual({
      ok: true,
      plan: { query: { win: SECONDARY_WINDOW_FLAG }, hash: '/s-42' }
    })
  })

  it('окно-наблюдатель добавляет свой флаг', () => {
    const result = planSessionWindow('s-42', { watch: true })
    expect(result.ok && result.plan.query).toEqual({ win: SECONDARY_WINDOW_FLAG, watch: '1' })
  })

  it('`watch` только при явном true', () => {
    const result = planSessionWindow('s-42', { watch: 'yes' })
    expect(result.ok && result.plan.query.watch).toBeUndefined()
  })

  it('номер с особыми знаками уезжает закодированным', () => {
    const result = planSessionWindow('a/b c')
    expect(result.ok && result.plan.hash).toBe('/a%2Fb%20c')
  })

  it('пустой номер — отказ, а не второе главное окно', () => {
    expect(planSessionWindow('')).toEqual({ ok: false, error: 'номер сессии не указан' })
    expect(planSessionWindow('   ').ok).toBe(false)
    expect(planSessionWindow(undefined).ok).toBe(false)
    expect(planSessionWindow(42).ok).toBe(false)
  })

  it('управляющие символы и невероятная длина — отказ', () => {
    expect(planSessionWindow(`s${String.fromCharCode(0)}42`).ok).toBe(false)
    expect(planSessionWindow('x'.repeat(500)).ok).toBe(false)
  })
})

describe('адрес окна', () => {
  it('флаги стоят ПЕРЕД решёткой — их рендерер читает их до маршрутизатора', () => {
    const result = planSessionWindow('s-42', { watch: true })
    const url = result.ok ? windowUrl('http://localhost:5173/', result.plan) : ''

    expect(url).toBe('http://localhost:5173/?win=secondary&watch=1#/s-42')
    expect(url.indexOf('win=')).toBeLessThan(url.indexOf('#'))
  })

  it('без параметров вопросительного знака нет', () => {
    expect(windowUrl('http://localhost:5173/', planAppWindow())).toBe('http://localhost:5173/')
  })
})
