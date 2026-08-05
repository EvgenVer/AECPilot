/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/starmap/types.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'

import type { StarmapGraph, StarmapNode } from '@/types/hermes'

export type MemoryCard = StarmapGraph['memory'][number]

export type Shape = 'circle' | 'diamond' | 'hexagon' | 'square' | 'triangle'

export interface Viewport {
  k: number
  x: number
  y: number
}

export interface Rgb {
  b: number
  g: number
  r: number
}

export interface Rect {
  h: number
  w: number
  x: number
  y: number
}

export interface SimNode extends StarmapNode, SimulationNodeDatum {
  outerRingIndex: number // first ring that caps this node's recency band
  rec: number // recency 0 (oldest) → 1 (newest)
  tr: number // time-anchored target radius
  x: number
  y: number
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode | string
  target: SimNode | string
}

// Per-mode line/ring style.
export interface GraphParams {
  lineAlpha: number
  lineDash: number
  lineDashed: boolean
  lineWidth: number
  ringAlpha: number
  ringDash: number
  ringDashed: boolean
  ringWidth: number
}

// Per-mode ring/orb params (band wash, light-sliver size, ring outline alpha, orb sheen).
export interface RingParams {
  bandAlpha: number
  lightSize: number
  ringAlpha: number
  sheen: number
}

export interface Palette {
  bandInk: Rgb
  base: Rgb
  bg: Rgb
  c: GraphParams
  chipBg: string
  darkTheme: boolean
  inkInv: string
  memoryInk: Rgb
  primary: Rgb
  skillInk: Rgb
}

export interface Ring {
  label: null | string
  r: number
  ratio: number
}

export interface RingLabelRect {
  h: number
  i: number
  w: number
  x: number
  y: number
}

export interface FadeBuckets {
  // Per-element "birth" progress 0→1 used to ease position (nodes rise outward
  // into place, rings grow out) as the scrubber reveals them. Separate from the
  // alpha buckets so it stays monotonic and isn't perturbed by focus/selection.
  appear: Map<string, number>
  labels: Map<string, number>
  links: Map<string, number>
  nodes: Map<string, number>
  rings: Map<string, number>
}
