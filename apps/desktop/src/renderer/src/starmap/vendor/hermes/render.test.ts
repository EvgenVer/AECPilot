// Task 1.6.B7.9 — the ported canvas painter. This is not a pixel test: there
// is no canvas implementation in the test environment and there is no point
// re-deriving 864 lines of drawing maths. It answers the two questions that
// actually matter for the port:
//
//   1. Does `render.ts` COMPILE and RUN against the neighbours ported in
//      1.6.B7.8, with its drawing logic untouched? A recording stub proves the
//      call actually executes rather than merely type-checks.
//   2. Does an empty graph — the normal state of a fresh project, spec §Факт 9
//      — paint nothing and animate nothing, instead of throwing on `rings[0]`
//      or leaving a half-drawn frame?

import { describe, expect, it } from 'vitest'
import { drawScene, drawScramble, type Scene } from './render'
import { MODE_DEFAULTS, RING_PARAMS } from './constants'
import type { FadeBuckets, Palette, SimLink, SimNode } from './types'

interface RecordingContext {
  ctx: CanvasRenderingContext2D
  calls: string[]
}

/** A canvas 2D stub that records the drawing verbs it is asked for.
 *
 * Everything returns a plausible value rather than `undefined`: the painter
 * chains `createRadialGradient(...).addColorStop(...)` and measures text, and a
 * stub that answers `undefined` would fail for its own reasons rather than the
 * code's. */
function recordingContext(): RecordingContext {
  const calls: string[] = []
  const gradient = { addColorStop: () => {} }
  const ctx = {
    canvas: { width: 800, height: 600 },
    arc: () => calls.push('arc'),
    beginPath: () => calls.push('beginPath'),
    clearRect: () => calls.push('clearRect'),
    closePath: () => calls.push('closePath'),
    createRadialGradient: () => {
      calls.push('createRadialGradient')
      return gradient
    },
    drawImage: () => calls.push('drawImage'),
    fill: () => calls.push('fill'),
    fillRect: () => calls.push('fillRect'),
    fillText: () => calls.push('fillText'),
    lineTo: () => calls.push('lineTo'),
    measureText: (text: string) => ({ width: text.length * 7 }),
    moveTo: () => calls.push('moveTo'),
    rect: () => calls.push('rect'),
    restore: () => calls.push('restore'),
    save: () => calls.push('save'),
    scale: () => calls.push('scale'),
    setLineDash: () => calls.push('setLineDash'),
    setTransform: () => calls.push('setTransform'),
    stroke: () => calls.push('stroke'),
    translate: () => calls.push('translate'),
    fillStyle: '',
    strokeStyle: '',
    font: '',
    globalAlpha: 1,
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic'
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

function palette(darkTheme = true): Palette {
  const ink = { r: 200, g: 120, b: 60 }
  return {
    bandInk: ink,
    base: darkTheme ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 },
    bg: darkTheme ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 },
    c: MODE_DEFAULTS[darkTheme ? 'dark' : 'light'],
    chipBg: 'rgba(0,0,0,0.72)',
    darkTheme,
    inkInv: 'rgba(0,0,0,1)',
    memoryInk: ink,
    primary: ink,
    skillInk: ink
  }
}

function emptyFades(): FadeBuckets {
  return {
    appear: new Map(),
    labels: new Map(),
    links: new Map(),
    nodes: new Map(),
    rings: new Map()
  }
}

function scene(over: Partial<Scene> = {}): Scene {
  const { ctx } = recordingContext()
  return {
    adjacency: new Map<string, Set<string>>(),
    byId: new Map<string, SimNode>(),
    ctx,
    dpr: 1,
    fades: emptyFades(),
    focusId: null,
    hoverId: null,
    hoverLink: null,
    hoverRing: null,
    links: [] as SimLink[],
    memById: new Map(),
    nodes: [] as SimNode[],
    palette: palette(),
    reveal: 1,
    rings: [],
    selectedRing: null,
    size: { w: 800, h: 600 },
    vp: { k: 1, x: 400, y: 300 },
    ...over
  }
}

describe('drawScene on an empty graph', () => {
  // A fresh project has an empty learning graph by design (only non-base skills
  // the agent created or has used reach it), so this is the FIRST state the
  // painter ever sees — not an edge case.
  it('does not throw and reports nothing to animate', () => {
    const result = drawScene(scene())
    expect(result.animating).toBe(false)
    expect(result.ringLabelRects).toEqual([])
  })

  it('paints no node, link or label — only clears the frame', () => {
    const recorder = recordingContext()
    drawScene(scene({ ctx: recorder.ctx }))
    expect(recorder.calls).toContain('clearRect')
    expect(recorder.calls).not.toContain('drawImage') // node orbs
    expect(recorder.calls).not.toContain('fillText') // labels and ring dates
    expect(recorder.calls).not.toContain('stroke') // links and ring outlines
  })

  it('survives a zero-sized viewport — the canvas is measured after mount', () => {
    expect(() => drawScene(scene({ size: { w: 0, h: 0 }, vp: { k: 1, x: 0, y: 0 } }))).not.toThrow()
  })

  it('paints in either theme without a theme-specific crash', () => {
    expect(() => drawScene(scene({ palette: palette(false) }))).not.toThrow()
    expect(RING_PARAMS.light.bandAlpha).toBeGreaterThan(0)
  })
})

describe('drawScramble', () => {
  // Its very first act is `rings[0]?.r ?? RING_INNER`; with no rings at all the
  // core still has a radius, and the early return only fires on a degenerate
  // zoom.
  it('draws the core with no rings, and returns early at zero zoom', () => {
    const withCore = recordingContext()
    drawScramble({
      ctx: withCore.ctx,
      dpr: 1,
      palette: palette(),
      rings: [],
      vp: { k: 1, x: 0, y: 0 }
    })
    expect(withCore.calls).toContain('createRadialGradient')

    const collapsed = recordingContext()
    drawScramble({
      ctx: collapsed.ctx,
      dpr: 1,
      palette: palette(),
      rings: [],
      vp: { k: 0, x: 0, y: 0 }
    })
    expect(collapsed.calls).not.toContain('createRadialGradient')
  })
})
