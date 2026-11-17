// Task T76: the continuous PDF strip — which page is «current» while scrolling,
// and the zoom step Ctrl+wheel and the buttons take.

import { describe, expect, it } from 'vitest'

import { ZOOM_STEPS, nextZoomStep, pageAtOffset } from './pdf-scroll-pure'

describe('pageAtOffset', () => {
  const tops = [0, 1012, 2024, 3036]

  it('the top of the strip is page 1', () => {
    expect(pageAtOffset(tops, 0)).toBe(1)
  })

  it('a mark inside page 3 is page 3', () => {
    expect(pageAtOffset(tops, 2500)).toBe(3)
  })

  it('exactly on the top edge of a page — that page', () => {
    expect(pageAtOffset(tops, 1012)).toBe(2)
  })

  it('past the last page — the last page', () => {
    expect(pageAtOffset(tops, 99999)).toBe(4)
  })

  it('an empty strip still answers 1', () => {
    expect(pageAtOffset([], 100)).toBe(1)
  })
})

describe('nextZoomStep', () => {
  it('from 100% — 125% up and 75% down', () => {
    expect(nextZoomStep(1, 1)).toBe(1.25)
    expect(nextZoomStep(1, -1)).toBe(0.75)
  })

  it('from a fit-to-width scale — the nearest step in that direction', () => {
    expect(nextZoomStep(0.83, 1)).toBe(1)
    expect(nextZoomStep(0.83, -1)).toBe(0.75)
  })

  it('stops at the ends of the ladder', () => {
    expect(nextZoomStep(ZOOM_STEPS[ZOOM_STEPS.length - 1], 1)).toBe(4)
    expect(nextZoomStep(ZOOM_STEPS[0], -1)).toBe(0.25)
  })
})
