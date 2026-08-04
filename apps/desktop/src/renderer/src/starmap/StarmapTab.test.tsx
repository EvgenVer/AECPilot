// Task 1.6.B7.11 — the "Карта" center tab. jsdom has no canvas implementation
// and measures no layout, so this file does NOT test what the map looks like.
// It tests the part that is ours rather than the donor's: the states around the
// canvas, that the canvas is mounted only when there is something to draw, that
// zoom/pan and a theme switch each reach the painter, and that the simulation's
// timer is stopped on unmount.
//
// Frames are driven BY HAND. A `requestAnimationFrame` stub that runs its
// callback synchronously would recurse until the stack gave out — the real loop
// re-schedules itself while the simulation is still cooling, and in a browser
// that is a frame apart, not a call deeper. Queueing the callbacks and running
// them one at a time is both safe and exact: "one repaint was requested" is
// precisely the assertion these tests want.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import StarmapTab from './StarmapTab'

const getLearningGraph = vi.fn()

let frames: FrameRequestCallback[] = []
/** Counts `clearRect` calls. `drawScene` issues a few per frame (it clears in
 * layers), so this is a "did it paint / did it paint again" signal, not a frame
 * count — which is all any assertion here needs. */
let painted = 0
/** Counts `computePalette` calls — it is the only thing here that reads
 * computed styles off an element. */
let paletteReads = 0

/** Runs up to `max` queued frames inside `act`, so React sees the work. */
async function flush(max = 1): Promise<void> {
  await act(async () => {
    for (let i = 0; i < max; i += 1) {
      const frame = frames.shift()
      if (!frame) break
      frame(0)
    }
  })
}

beforeEach(() => {
  frames = []
  painted = 0
  paletteReads = 0

  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  }) as typeof requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', (() => {
    frames = []
  }) as typeof cancelAnimationFrame)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    }
  )

  const realGetComputedStyle = window.getComputedStyle.bind(window)
  vi.stubGlobal('getComputedStyle', ((element: Element) => {
    paletteReads += 1
    return realGetComputedStyle(element)
  }) as typeof window.getComputedStyle)

  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    return {
      canvas: { width: 800, height: 600 },
      arc: () => {},
      beginPath: () => {},
      clearRect: () => {
        painted += 1
      },
      closePath: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      drawImage: () => {},
      fill: () => {},
      fillRect: () => {},
      fillText: () => {},
      getImageData: () => ({ data: [128, 128, 128, 255] }),
      lineTo: () => {},
      measureText: (text: string) => ({ width: text.length * 7 }),
      moveTo: () => {},
      rect: () => {},
      restore: () => {},
      save: () => {},
      scale: () => {},
      setLineDash: () => {},
      setTransform: () => {},
      stroke: () => {},
      translate: () => {}
    }
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext

  // jsdom gives every element a zero-sized rect, and the loop refuses to paint
  // into a zero-sized canvas — correctly, since the real one is measured after
  // mount. A fixed rect stands in for layout.
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    toJSON: () => ({})
  })) as unknown as typeof Element.prototype.getBoundingClientRect

  getLearningGraph.mockResolvedValue({
    nodes: [
      {
        id: 'rebar',
        label: 'Армирование',
        kind: 'skill',
        timestamp: 1_780_000_000,
        category: 'general',
        useCount: 3
      },
      {
        id: 'memory:memory:0',
        label: 'Заметка о марке бетона',
        kind: 'memory',
        timestamp: 1_780_100_000
      }
    ],
    memory: [{ source: 'memory', body: 'Бетон B25 по проекту' }],
    edges: [{ source: 'rebar', target: 'memory:memory:0' }]
  })
  window.aecpilot = { getLearningGraph } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function mounted(): Promise<HTMLElement> {
  render(<StarmapTab />)
  const canvas = await screen.findByLabelText('Карта обучения агента')
  await flush(1)
  return canvas
}

describe('StarmapTab', () => {
  it('draws the graph on a canvas and says what is on it', async () => {
    await mounted()
    expect(screen.getByText(/Узлов: 2 · связей: 1/)).toBeTruthy()
    expect(painted).toBeGreaterThan(0)
  })

  // Required by the task: an empty graph explains itself rather than leaving a
  // blank rectangle. On a fresh project this is the normal state, not an edge
  // case (spec §Факт 9).
  it('explains an empty graph instead of showing a blank canvas', async () => {
    getLearningGraph.mockResolvedValue({ nodes: [], memory: [] })
    render(<StarmapTab />)
    await waitFor(() => expect(screen.getByText(/Карта пуста/)).toBeTruthy())
    expect(screen.queryByLabelText('Карта обучения агента')).toBeNull()
    expect(painted).toBe(0)
  })

  it('explains a failed load and offers to retry', async () => {
    getLearningGraph.mockRejectedValue(new Error('Ядро не ответило'))
    render(<StarmapTab />)
    await waitFor(() => expect(screen.getByText(/Не удалось получить граф/)).toBeTruthy())
    expect(screen.getByText(/Ядро не ответило/)).toBeTruthy()

    getLearningGraph.mockResolvedValue({ nodes: [], memory: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(screen.getByText(/Карта пуста/)).toBeTruthy())
  })

  // Required by the task: the redraw follows the theme. `computePalette` reads
  // computed styles off the canvas, so the ONLY thing that tells the map a
  // theme changed is the `data-theme` attribute it observes — and it must
  // repaint rather than rebuild, or the layout would re-settle under the user.
  it('repaints with a fresh palette on a theme switch, without re-laying-out', async () => {
    await mounted()
    const paletteReadsBefore = paletteReads
    const paintedBefore = painted

    await act(async () => {
      document.documentElement.dataset.theme = 'dark'
      // MutationObserver callbacks are delivered as a microtask.
      await Promise.resolve()
    })
    await flush(3)

    // `computePalette` reads computed styles off the canvas; a repaint that did
    // NOT re-read them would keep drawing the light palette on a dark shell.
    expect(paletteReads).toBeGreaterThan(paletteReadsBefore)
    expect(painted).toBeGreaterThan(paintedBefore)
    // A rebuild would have re-settled the layout; the canvas is the same one.
    expect(screen.getByText(/Узлов: 2 · связей: 1/)).toBeTruthy()
  })

  // The camera arithmetic itself is pinned in `viewport-pure.test.ts`, where it
  // can be checked exactly; jsdom draws nothing and would not tell "zoomed
  // about the cursor" from "zoomed about the origin". What is checked here is
  // only that the gestures reach the loop at all.
  it('survives zoom and pan gestures and keeps painting', async () => {
    const canvas = await mounted()
    const before = painted

    fireEvent.wheel(canvas, { deltaY: -120, clientX: 500, clientY: 200 })
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 400, clientY: 300 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 430, clientY: 330 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 430, clientY: 330 })
    await flush(3)

    expect(painted).toBeGreaterThan(before)
    expect(screen.getByLabelText('Карта обучения агента')).toBeTruthy()
  })

  // The core of the disk is empty by construction (RING_INNER), so a pointer at
  // the exact centre is over nothing — which is the state a tooltip must not
  // invent something for.
  it('shows no tooltip while the pointer is over empty space', async () => {
    const canvas = await mounted()
    fireEvent.pointerMove(canvas, { clientX: 400, clientY: 300 })
    await flush(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  // A d3-timer left running would keep ticking a graph nobody draws for the
  // life of the window.
  it('stops painting once the tab goes away', async () => {
    render(<StarmapTab />)
    await screen.findByLabelText('Карта обучения агента')
    await flush(1)
    const before = painted

    cleanup()
    await flush(5)
    expect(painted).toBe(before)
  })
})
