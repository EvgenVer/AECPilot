// Задача 3E.24. Арифметика попадания — отдельно от окна, потому что e2e при
// 125 % доказывает ФАКТ попадания, но не говорит, что именно пересчитано: он
// одинаково зелен и когда масштабируется лишнее.
//
// Расширение `.tsx` ради jsdom: модуль спрашивает множитель у моста
// (`window.aecpilot.zoomFactor`) в момент отправки, и подменять `window`
// руками ради одного числа значило бы проверять подмену, а не модуль.

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PreviewInputEvent } from '../../donor/app/chat/right-rail/preview-input'

import { scaleEvent, scaledPreviewInput } from './scale-input'

const CLICK: PreviewInputEvent = { button: 'left', clickCount: 1, type: 'mouseDown', x: 144, y: 90 }

function withFactor(factor: number | undefined): void {
  window.aecpilot = { zoomFactor: factor === undefined ? undefined : () => factor } as never
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('scaleEvent', () => {
  it('точка умножается на масштаб и округляется', () => {
    // 144 * 1.25 = 180, 90 * 1.25 = 112.5 → 113. Округление здесь не косметика:
    // `sendInputEvent` принимает целые пиксели, и дробная точка сделала бы
    // попадание зависящим от того, как её усечёт Chromium.
    expect(scaleEvent(CLICK, 1.25)).toEqual({ ...CLICK, x: 180, y: 113 })
  })

  it('масштаб меньше единицы сжимает так же', () => {
    expect(scaleEvent(CLICK, 0.9)).toEqual({ ...CLICK, x: 130, y: 81 })
  })

  it('при 100 % событие возвращается тем же объектом — лишней работы нет', () => {
    expect(scaleEvent(CLICK, 1)).toBe(CLICK)
  })

  it('колесо и движение мыши тоже несут точку, и она пересчитывается', () => {
    expect(scaleEvent({ deltaX: 0, deltaY: -120, type: 'mouseWheel', x: 40, y: 20 }, 1.25)).toEqual(
      {
        deltaX: 0,
        deltaY: -120,
        type: 'mouseWheel',
        x: 50,
        y: 25
      }
    )
    expect(scaleEvent({ type: 'mouseMove', x: 40, y: 20 }, 1.25)).toEqual({
      type: 'mouseMove',
      x: 50,
      y: 25
    })
  })

  it('клавиатурному событию координаты НЕ дописываются', () => {
    // У него их нет, и выдуманная точка отправила бы нажатие в случайное место.
    const key: PreviewInputEvent = { keyCode: 'a', type: 'char' }

    expect(scaleEvent(key, 1.25)).toBe(key)
  })
})

describe('scaledPreviewInput', () => {
  it('масштаб читается на КАЖДУЮ отправку, а не запоминается', () => {
    // Человек может нажать Ctrl+= между двумя нажатиями агента; запомненное
    // значение промахнулось бы так же, как промахивалась единица.
    const send = vi.fn()
    const input = scaledPreviewInput({ focus: () => {}, send })

    withFactor(1)
    input.send(CLICK)
    withFactor(1.25)
    input.send(CLICK)

    expect(send.mock.calls.map(([event]) => (event as { x: number }).x)).toEqual([144, 180])
  })

  it('фокус проходит как есть: его масштабировать нечем', () => {
    const focus = vi.fn()

    withFactor(1.25)
    scaledPreviewInput({ focus, send: () => {} }).focus()

    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('без моста множителя поведение ровно донорское', () => {
    // Окно без нашего preload — не повод ронять нажатие: единица означает «как
    // у них», а не «как получится».
    const send = vi.fn()

    withFactor(undefined)
    scaledPreviewInput({ focus: () => {}, send }).send(CLICK)

    expect(send).toHaveBeenCalledWith(CLICK)
  })

  it('бессмысленный множитель не превращает нажатие в ноль', () => {
    const send = vi.fn()

    window.aecpilot = { zoomFactor: () => 0 } as never
    scaledPreviewInput({ focus: () => {}, send }).send(CLICK)

    expect(send).toHaveBeenCalledWith(CLICK)
  })
})
