// Camera and hit-testing arithmetic for the map (task 1.6.B7.11).
//
// Pure on purpose. jsdom measures no layout and draws no canvas, so a component
// test cannot tell "zoomed about the cursor" from "zoomed about the origin" —
// both look like a canvas nobody painted. These are the rules that decide where
// the user ends up looking, so they are pinned here where they can be checked
// exactly.

import { clamp, nodeRadius } from './vendor/hermes/geometry'
import { TILT, ZOOM_MAX, ZOOM_MIN } from './vendor/hermes/constants'
import type { SimNode, Viewport } from './vendor/hermes/types'

/** Screen point → world point, undoing the painter's own projection
 * (`wx * k + x`, `wy * k * TILT + y`). */
export function toWorld(vp: Viewport, cx: number, cy: number): { x: number; y: number } {
  return { x: (cx - vp.x) / vp.k, y: (cy - vp.y) / (vp.k * TILT) }
}

/** Zoom about a fixed screen point.
 *
 * The point under the cursor must not move: without the compensation below the
 * map slides away from whatever the user aimed at, which reads as the zoom
 * being "off". The scale is clamped to the painter's own limits so the camera
 * can never leave the range `fitViewport` guarantees. */
export function zoomAt(vp: Viewport, cx: number, cy: number, deltaY: number): Viewport {
  const k = clamp(vp.k * Math.exp(-deltaY * 0.001), ZOOM_MIN, ZOOM_MAX)
  return {
    k,
    x: cx - ((cx - vp.x) / vp.k) * k,
    y: cy - ((cy - vp.y) / vp.k) * k
  }
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { k: vp.k, x: vp.x + dx, y: vp.y + dy }
}

/** Whether a pointer press-and-release counts as a drag rather than a click.
 *
 * Without this, panning the map selects whatever happened to be under the
 * release — the most annoying possible outcome of a deliberate gesture. Four
 * pixels of Manhattan distance is below the noise of a hand on a trackpad and
 * far under a deliberate drag. */
export function movedFar(from: { x: number; y: number }, toX: number, toY: number): boolean {
  return Math.abs(toX - from.x) + Math.abs(toY - from.y) > 4
}

/** The node under a world-space point, or null.
 *
 * The hit radius follows the glyph but never drops below a pointer-sized
 * minimum in SCREEN space (hence the division by `k`): a skill drawn at 2 px
 * would otherwise be unclickable at a low zoom. Ties go to the nearest centre,
 * so overlapping orbs pick the one actually aimed at rather than the first in
 * array order. */
export function pickNodeId(
  nodes: readonly SimNode[],
  world: { x: number; y: number },
  k: number
): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const node of nodes) {
    const reach = Math.max(nodeRadius(node) + 4, 8) / (k || 1)
    const dist = Math.hypot(node.x - world.x, node.y - world.y)
    if (dist <= reach && dist < bestDist) {
      best = node.id
      bestDist = dist
    }
  }
  return best
}
