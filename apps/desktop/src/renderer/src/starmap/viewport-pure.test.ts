import { describe, expect, it } from 'vitest'
import { movedFar, panBy, pickNodeId, toWorld, zoomAt } from './viewport-pure'
import { ZOOM_MAX, ZOOM_MIN } from './vendor/hermes/constants'
import type { SimNode, Viewport } from './vendor/hermes/types'

const VP: Viewport = { k: 1, x: 400, y: 300 }

function node(id: string, x: number, y: number, over: Partial<SimNode> = {}): SimNode {
  return {
    id,
    label: id,
    kind: 'skill',
    timestamp: null,
    category: 'general',
    useCount: 0,
    state: 'active',
    createdBy: null,
    pinned: false,
    outerRingIndex: 0,
    rec: 0,
    tr: 0,
    x,
    y,
    ...over
  }
}

describe('toWorld', () => {
  it('undoes the painter projection', () => {
    expect(toWorld(VP, 400, 300)).toEqual({ x: 0, y: 0 })
    expect(toWorld({ k: 2, x: 0, y: 0 }, 100, 50)).toEqual({ x: 50, y: 25 })
  })
})

describe('zoomAt', () => {
  // The whole point: the pixel under the cursor stays under the cursor.
  // Without this the map slides away from whatever the user aimed at.
  it('keeps the point under the cursor fixed', () => {
    const before = toWorld(VP, 500, 200)
    const zoomed = zoomAt(VP, 500, 200, -120)
    const after = toWorld(zoomed, 500, 200)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })

  it('zooms in on a negative delta and out on a positive one', () => {
    expect(zoomAt(VP, 400, 300, -120).k).toBeGreaterThan(VP.k)
    expect(zoomAt(VP, 400, 300, 120).k).toBeLessThan(VP.k)
  })

  // The camera may never leave the range `fitViewport` guarantees, or the
  // painter's own sizing assumptions stop holding.
  it('clamps to the painter zoom limits in both directions', () => {
    let vp = VP
    for (let i = 0; i < 200; i += 1) vp = zoomAt(vp, 400, 300, -500)
    expect(vp.k).toBeCloseTo(ZOOM_MAX)

    vp = VP
    for (let i = 0; i < 200; i += 1) vp = zoomAt(vp, 400, 300, 500)
    expect(vp.k).toBeCloseTo(ZOOM_MIN)
  })
})

describe('panBy', () => {
  it('moves the camera without changing the scale', () => {
    expect(panBy(VP, 30, -10)).toEqual({ k: 1, x: 430, y: 290 })
  })
})

describe('movedFar', () => {
  // Panning must not select whatever sits under the release — the most
  // annoying possible outcome of a deliberate gesture.
  it('separates a shaky click from a drag', () => {
    expect(movedFar({ x: 100, y: 100 }, 101, 102)).toBe(false)
    expect(movedFar({ x: 100, y: 100 }, 140, 100)).toBe(true)
  })
})

describe('pickNodeId', () => {
  const nodes = [node('a', 0, 0), node('b', 60, 0)]

  it('finds the node under the point and nothing in empty space', () => {
    expect(pickNodeId(nodes, { x: 1, y: 1 }, 1)).toBe('a')
    expect(pickNodeId(nodes, { x: 30, y: 0 }, 1)).toBeNull()
  })

  it('prefers the nearest centre when two glyphs overlap', () => {
    const stacked = [node('far', 0, 0), node('near', 3, 0)]
    expect(pickNodeId(stacked, { x: 3.2, y: 0 }, 1)).toBe('near')
  })

  // A skill drawn at 2 px would be unclickable at a low zoom if the hit radius
  // were world-space only.
  it('widens the hit area as the map zooms out', () => {
    const far = { x: 20, y: 0 }
    expect(pickNodeId(nodes, far, 1)).toBeNull()
    expect(pickNodeId(nodes, far, 0.3)).toBe('a')
  })

  it('answers null on an empty graph and survives a zero scale', () => {
    expect(pickNodeId([], { x: 0, y: 0 }, 1)).toBeNull()
    expect(pickNodeId(nodes, { x: 0, y: 0 }, 0)).toBe('a')
  })
})
