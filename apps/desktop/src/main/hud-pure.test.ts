// Задача 3.24. У этого окна нет заголовка, за который его можно поймать, —
// значит уехавшее за край окно человек не вернёт. Поэтому проверяются границы.

import { describe, expect, it } from 'vitest'

import {
  clampBounds,
  defaultHudBounds,
  HUD_MIN_HEIGHT,
  HUD_MIN_WIDTH,
  movedBy,
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

describe('перетаскивание', () => {
  const start = { x: 100, y: 100, width: 760, height: 260 }

  it('двигает на дельту', () => {
    expect(movedBy(start, { x: 50, y: -30, width: 0, height: 0 }, WORK)).toMatchObject({
      x: 150,
      y: 70
    })
  })

  it('неполный запрос не обнуляет то, чего в нём нет', () => {
    expect(movedBy(start, { x: 10 }, WORK)).toMatchObject({ width: 760, height: 260, y: 100 })
  })

  it('за край не уводит', () => {
    const bounds = movedBy(start, { x: -9000, y: -9000 }, WORK)
    expect(bounds).toMatchObject({ x: 0, y: 0 })
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
