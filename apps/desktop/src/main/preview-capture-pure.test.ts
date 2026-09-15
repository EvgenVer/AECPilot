// Задача 3.B4. Геометрия снимка предпросмотра — тестом, а не чтением
// обработчика. Главное здесь: вырез считается в битмапе по масштабу, а не
// доверяется `capturePage(rect)` гостя, и отказ приходит ошибкой, а не пустой
// картинкой.

import { describe, expect, it } from 'vitest'

import type { CaptureImage, CaptureRect, CaptureSize } from './preview-capture-pure'
import { cropCapture, mapViewportRectToImage, normalizeCaptureRect } from './preview-capture-pure'

function image(size: CaptureSize, empty = false, crops: CaptureRect[] = []): CaptureImage {
  return {
    crop(rect) {
      crops.push(rect)
      return image({ height: rect.height, width: rect.width }, false, crops)
    },
    getSize: () => size,
    isEmpty: () => empty,
    toPNG: () => Buffer.from(`${size.width}x${size.height}`)
  }
}

describe('normalizeCaptureRect', () => {
  it('дроби — к целым наружу, отрицательное — к нулю, не меньше пикселя', () => {
    expect(normalizeCaptureRect({ x: -3.2, y: 1.5, width: 0.2, height: 10.1 })).toEqual({
      x: 0,
      y: 1,
      width: 1,
      height: 11
    })
  })

  it('мусор вместо прямоугольника — «без выреза», а не исключение', () => {
    expect(normalizeCaptureRect(undefined)).toBeUndefined()
    expect(normalizeCaptureRect({ x: 'a', y: 0, width: 1, height: 1 })).toBeUndefined()
    expect(normalizeCaptureRect({ x: Number.NaN, y: 0, width: 1, height: 1 })).toBeUndefined()
  })
})

describe('mapViewportRectToImage', () => {
  it('битмап вдвое крупнее viewport (DPR 2) — вырез удваивается', () => {
    expect(
      mapViewportRectToImage(
        { x: 10, y: 20, width: 100, height: 50 },
        { width: 400, height: 300 },
        { width: 800, height: 600 }
      )
    ).toEqual({ x: 20, y: 40, width: 200, height: 100 })
  })

  it('вырез обрезается краем картинки', () => {
    expect(
      mapViewportRectToImage(
        { x: 350, y: 0, width: 100, height: 10 },
        { width: 400, height: 300 },
        { width: 400, height: 300 }
      )
    ).toEqual({ x: 350, y: 0, width: 50, height: 10 })
  })

  it('вырез целиком за краем — null', () => {
    expect(
      mapViewportRectToImage(
        { x: 500, y: 0, width: 10, height: 10 },
        { width: 400, height: 300 },
        { width: 400, height: 300 }
      )
    ).toBeNull()
  })
})

describe('cropCapture', () => {
  it('без прямоугольника — снимок целиком, data-URL с PNG', () => {
    expect(cropCapture(image({ width: 4, height: 3 }), undefined, undefined)).toBe(
      `data:image/png;base64,${Buffer.from('4x3').toString('base64')}`
    )
  })

  it('с прямоугольником — вырез по масштабу viewport → битмап', () => {
    const crops: CaptureRect[] = []
    const out = cropCapture(
      image({ width: 800, height: 600 }, false, crops),
      { x: 10, y: 20, width: 100, height: 50 },
      { width: 400, height: 300 }
    )

    expect(crops).toEqual([{ x: 20, y: 40, width: 200, height: 100 }])
    expect(out).toBe(`data:image/png;base64,${Buffer.from('200x100').toString('base64')}`)
  })

  it('вырез за краем — видимая страница целиком, а не отказ', () => {
    expect(
      cropCapture(
        image({ width: 400, height: 300 }),
        { x: 900, y: 900, width: 10, height: 10 },
        { width: 400, height: 300 }
      )
    ).toBe(`data:image/png;base64,${Buffer.from('400x300').toString('base64')}`)
  })

  it('пустой снимок — ошибка, а не пустая картинка', () => {
    expect(() => cropCapture(image({ width: 1, height: 1 }, true), undefined, undefined)).toThrow(
      'Снимок предпросмотра пуст'
    )
  })
})
