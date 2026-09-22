// Задача 3.24. У этого окна нет заголовка, за который его можно поймать, —
// значит уехавшее за край окно человек не вернёт. Поэтому проверяются границы.

import { describe, expect, it } from 'vitest'

import {
  clampBounds,
  defaultHudBounds,
  HUD_MIN_HEIGHT,
  HUD_MIN_WIDTH,
  hudDragOrigin,
  hudGrabOffset,
  readBounds
} from './hud-pure'

const WORK = { x: 0, y: 0, width: 1920, height: 1040 }

describe('где лента появляется впервые', () => {
  it('по центру снизу — там, где обычно нет чужого содержимого', () => {
    const bounds = defaultHudBounds(WORK)

    expect(bounds.x + bounds.width / 2).toBe(WORK.width / 2)
    expect(bounds.y + bounds.height).toBeLessThan(WORK.height)
    expect(bounds.y + bounds.height).toBeGreaterThan(WORK.height - 100)
  })

  it('на маленьком экране не шире рабочей области', () => {
    const bounds = defaultHudBounds({ x: 0, y: 0, width: 400, height: 300 })

    expect(bounds.width).toBeLessThanOrEqual(400)
    expect(bounds.height).toBeLessThanOrEqual(300)
  })

  it('рабочая область не с нуля — окно считается от неё', () => {
    const bounds = defaultHudBounds({ x: 1920, y: 40, width: 1280, height: 960 })

    expect(bounds.x).toBeGreaterThanOrEqual(1920)
    expect(bounds.y).toBeGreaterThanOrEqual(40)
  })
})

describe('окно не уезжает за край', () => {
  it('слева и сверху', () => {
    expect(clampBounds({ x: -500, y: -500, width: 760, height: 260 }, WORK)).toMatchObject({
      x: 0,
      y: 0
    })
  })

  it('справа и снизу', () => {
    const bounds = clampBounds({ x: 5000, y: 5000, width: 760, height: 260 }, WORK)

    expect(bounds.x + bounds.width).toBe(WORK.width)
    expect(bounds.y + bounds.height).toBe(WORK.height)
  })

  it('размер не меньше разумного и не больше экрана', () => {
    expect(clampBounds({ x: 0, y: 0, width: 10, height: 10 }, WORK)).toMatchObject({
      width: HUD_MIN_WIDTH,
      height: HUD_MIN_HEIGHT
    })
    expect(clampBounds({ x: 0, y: 0, width: 9000, height: 9000 }, WORK)).toMatchObject({
      width: WORK.width,
      height: WORK.height
    })
  })
})

describe('перетаскивание за композер (D-100)', () => {
  const start = { x: 100, y: 100, width: 760, height: 260 }

  it('окно встаёт так, что точка захвата остаётся под курсором', () => {
    const offset = hudGrabOffset({ x: 140, y: 120 }, start)
    expect(offset).toEqual({ x: 40, y: 20 })
    expect(hudDragOrigin({ x: 600, y: 400 }, offset)).toEqual({ x: 560, y: 380 })
  })

  it('без захвата двигать нечего', () => {
    expect(hudDragOrigin({ x: 600, y: 400 }, null)).toBeNull()
  })

  it('уехавшее за край прижимается рабочей областью', () => {
    const offset = hudGrabOffset({ x: 140, y: 120 }, start)
    const origin = hudDragOrigin({ x: -9000, y: -9000 }, offset)!
    expect(clampBounds({ ...origin, width: 760, height: 260 }, WORK)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('запрос точных границ', () => {
  it('четыре числа — принимается', () => {
    expect(readBounds({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
  })

  it('мусор — отказ, а не окно нулевого размера', () => {
    expect(readBounds({ x: 1, y: 2, width: 3 })).toBeNull()
    expect(readBounds({ x: 'a', y: 2, width: 3, height: 4 })).toBeNull()
    expect(readBounds({ x: Number.NaN, y: 2, width: 3, height: 4 })).toBeNull()
    expect(readBounds(null)).toBeNull()
  })
})
