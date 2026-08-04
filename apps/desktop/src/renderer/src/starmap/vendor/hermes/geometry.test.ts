// Task 1.6.B7.8 — the ported starmap island. These tests do not re-derive the
// donor's maths; they pin the properties the map depends on, so a future
// refactor (or a donor upgrade) cannot quietly change where a node lands or how
// old content reads.

import { describe, expect, it } from 'vitest'
import {
  clamp,
  distToSegmentSq,
  fitViewport,
  hash,
  nodeRadius,
  radiusForRecency,
  recencyInk
} from './geometry'
import { RING_INNER, RING_OUTER, ZOOM_MAX, ZOOM_MIN } from './constants'
import { memoryInkFor, mixRgb, darken, luminance, rgba } from './color'
import { buildTimeAxis, computeRecency, dateAtReveal, LEAD_IN, recForRatio } from './time-axis'
import { countLabel, ellipsize, formatDate, metaBadges, wrapText } from './text'
import type { StarmapGraph, StarmapNode } from './graph-types'

function skill(id: string, over: Partial<StarmapNode> = {}): StarmapNode {
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
    ...over
  }
}

function graph(nodes: StarmapNode[]): StarmapGraph {
  return { nodes, edges: [], clusters: [], memory: [], stats: {} }
}

/** A canvas 2D context stub good enough for the text helpers: width is
 * proportional to length, which is all the wrapping and trimming rules need. */
const measuring = {
  measureText: (text: string) => ({ width: text.length * 10 })
} as unknown as CanvasRenderingContext2D

describe('geometry', () => {
  it('clamps to the range in both directions', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(50, 0, 10)).toBe(10)
    expect(clamp(4, 0, 10)).toBe(4)
  })

  // The layout angle and the per-node jitter both come from this hash, so a
  // node must land in the same place between runs — the map is not allowed to
  // reshuffle itself on every open.
  it('hashes an id deterministically into a 32-bit range', () => {
    expect(hash('rebar-spacing')).toBe(hash('rebar-spacing'))
    expect(hash('rebar-spacing')).not.toBe(hash('rebar-spacings'))
    expect(hash('x')).toBeGreaterThanOrEqual(0)
    expect(hash('x')).toBeLessThan(2 ** 32)
  })

  it('sizes a node by use-count, with archived skills smaller and pinned bigger', () => {
    const fresh = nodeRadius(skill('a'))
    const used = nodeRadius(skill('a', { useCount: 9 }))
    const archived = nodeRadius(skill('a', { state: 'archived' }))
    const pinned = nodeRadius(skill('a', { pinned: true }))
    expect(used).toBeGreaterThan(fresh)
    expect(archived).toBeLessThan(fresh)
    expect(pinned).toBeGreaterThan(fresh)
    // Memory is a fixed size — it has no use-count to grow by.
    expect(nodeRadius(skill('m', { kind: 'memory' }))).toBeCloseTo(4.4)
  })

  it('makes recent content brighter than old content, monotonically', () => {
    const old = recencyInk(0)
    const mid = recencyInk(0.5)
    const fresh = recencyInk(1)
    expect(old).toBeLessThan(mid)
    expect(mid).toBeLessThan(fresh)
    expect(fresh).toBeLessThanOrEqual(1)
  })

  it('places the oldest node at the inner ring and the newest at the outer', () => {
    expect(radiusForRecency(0)).toBeCloseTo(RING_INNER)
    expect(radiusForRecency(1)).toBeCloseTo(RING_OUTER)
    expect(radiusForRecency(0.5)).toBeGreaterThan(RING_INNER)
  })

  it('fits the disk inside the viewport within the zoom limits', () => {
    const view = fitViewport(1200, 800)
    expect(view.k).toBeGreaterThanOrEqual(ZOOM_MIN)
    expect(view.k).toBeLessThanOrEqual(ZOOM_MAX)
    expect(view.x).toBeCloseTo(600)
    // A degenerate viewport must not produce NaN — the canvas is measured
    // before layout on the first frame.
    expect(fitViewport(0, 0)).toEqual({ k: 1, x: 0, y: 0 })
  })

  it('measures distance to a segment, including past both ends', () => {
    expect(distToSegmentSq(5, 3, 0, 0, 10, 0)).toBeCloseTo(9)
    expect(distToSegmentSq(-4, 0, 0, 0, 10, 0)).toBeCloseTo(16)
    // Degenerate segment (both endpoints equal) falls back to point distance.
    expect(distToSegmentSq(3, 4, 0, 0, 0, 0)).toBeCloseTo(25)
  })
})

describe('colour', () => {
  it('mixes, darkens and clamps the blend factor', () => {
    const white = { r: 255, g: 255, b: 255 }
    const black = { r: 0, g: 0, b: 0 }
    expect(mixRgb(white, black, 0.5)).toEqual({ r: 128, g: 128, b: 128 })
    expect(mixRgb(white, black, 5)).toEqual(black)
    expect(darken(white, 1)).toEqual(black)
  })

  it('reads a light foreground as high luminance — this is how dark theme is detected', () => {
    expect(luminance(255, 255, 255)).toBeGreaterThan(0.55)
    expect(luminance(20, 20, 20)).toBeLessThan(0.55)
  })

  it('gives memory a hue distinct from the theme primary', () => {
    const primary = { r: 200, g: 80, b: 40 }
    const ink = memoryInkFor(primary, { r: 0, g: 0, b: 0 })
    expect(ink).not.toEqual(primary)
    expect(rgba(ink, 0.5)).toMatch(/^rgba\(\d+,\d+,\d+,0\.5\)$/)
  })
})

describe('time axis', () => {
  it('maps timestamps to recency, oldest at the lead-in and newest at 1', () => {
    const { rec, timed } = computeRecency([
      skill('old', { timestamp: 1_700_000_000 }),
      skill('new', { timestamp: 1_800_000_000 })
    ])
    expect(timed).toBe(true)
    expect(rec.get('old')).toBeCloseTo(LEAD_IN)
    expect(rec.get('new')).toBeCloseTo(1)
  })

  // Required by the spec: an undated graph still builds up, in a stable order,
  // rather than collapsing every node onto one ring.
  it('falls back to ordinal recency when nothing is dated', () => {
    const { rec, timed } = computeRecency([skill('b'), skill('a'), skill('c')])
    expect(timed).toBe(false)
    expect(rec.get('a')).toBeCloseTo(recForRatio(0))
    expect(rec.get('c')).toBeCloseTo(recForRatio(1))
  })

  it('buckets nodes into the histogram, keeping skills and memories apart', () => {
    const axis = buildTimeAxis(
      graph([
        skill('a', { timestamp: 1_700_000_000 }),
        skill('m', { kind: 'memory', timestamp: 1_800_000_000 })
      ]),
      8
    )
    expect(axis.buckets).toHaveLength(8)
    expect(axis.size).toBe(2)
    expect(axis.buckets.reduce((sum, b) => sum + b.skill, 0)).toBe(1)
    expect(axis.buckets.reduce((sum, b) => sum + b.memory, 0)).toBe(1)
    expect(axis.maxTotal).toBe(1)
  })

  it('answers no date for a reveal position on an undated graph', () => {
    expect(dateAtReveal(buildTimeAxis(graph([skill('a')])), 0.5)).toBeNull()
    const timedAxis = buildTimeAxis(
      graph([skill('a', { timestamp: 100 }), skill('b', { timestamp: 200 })])
    )
    expect(dateAtReveal(timedAxis, 0.5)).toBe(150)
  })

  // An empty graph reaches this code on a fresh project (spec §Факт 9), so it
  // has to survive rather than divide by zero.
  it('survives an empty graph', () => {
    const axis = buildTimeAxis(graph([]))
    expect(axis.size).toBe(0)
    expect(axis.maxTotal).toBe(0)
    expect(axis.timed).toBe(false)
  })
})

describe('text', () => {
  it('formats a date and says so plainly when there is none', () => {
    expect(formatDate(null)).toBe('без даты')
    expect(formatDate(0)).toBe('без даты')
    expect(formatDate(1_780_000_000)).toMatch(/2026/)
  })

  it('builds tooltip badges per kind', () => {
    expect(metaBadges(skill('m', { kind: 'memory', memorySource: 'profile' }))).toContain(
      'память профиля'
    )
    const learned = metaBadges(skill('s', { category: 'rebar', createdBy: 'agent', pinned: true }))
    expect(learned).toEqual(expect.arrayContaining(['rebar', 'выучен сам', 'закреплён']))
  })

  it('shows a use-count only for a skill that has one', () => {
    expect(countLabel(skill('s', { useCount: 3 }))).toBe('x3')
    expect(countLabel(skill('s'))).toBeNull()
    expect(countLabel(skill('m', { kind: 'memory', useCount: 3 }))).toBeNull()
  })

  it('wraps a title greedily and trims a long label with an ellipsis', () => {
    expect(wrapText(measuring, 'один два три четыре', 100)).toEqual(['один два', 'три четыре'])
    expect(ellipsize(measuring, 'короткий', 1000)).toBe('короткий')
    const trimmed = ellipsize(measuring, 'очень длинное имя узла', 60)
    expect(trimmed.endsWith('…')).toBe(true)
    expect(trimmed.length).toBeLessThan('очень длинное имя узла'.length)
  })
})
