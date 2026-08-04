// The "Карта" center tab (task 1.6.B7.11). Contract:
// specs/external-surfaces.md §Карта обучения.
//
// Division of labour, per the transfer decision (PLAN, вариант C): the donor's
// layout and painter are used AS THEY ARE (`vendor/hermes/{simulation,render}`),
// and the markup, the interaction wiring and the states around the canvas are
// ours. Their `star-map.tsx` is 972 lines welded to nanostores, i18n and their
// component library; it was read as a behaviour spec, not copied.
//
// Four things here are decisions rather than plumbing:
//
// - **The palette is recomputed from OUR tokens, not hard-coded.**
//   `computePalette` reads `getComputedStyle` off the canvas, so the map takes
//   its colours from the same CSS variables as the rest of the shell. A theme
//   switch flips `data-theme` on the document root; a `MutationObserver` on
//   that attribute is what makes the map follow — nothing else notifies it.
//   The observer only bumps a version and asks for a frame: rebuilding the
//   simulation would re-settle the layout, and changing the theme must not
//   move the map.
// - **The animation loop stops.** `drawScene` reports `animating`; when it is
//   false and the simulation has cooled, no further frame is scheduled. A
//   canvas repainting 60 times a second behind a tab nobody is looking at is
//   the kind of thing that shows up as "the app runs warm".
// - **`schedule` lives in a ref.** The loop is owned by the effect, but zoom,
//   pan, hover and selection all need to ask for a frame from outside it. A
//   ref is the seam; the alternative — a state bump per pointer move — would
//   re-render the whole component sixty times a second to repaint a canvas
//   that React does not manage anyway.
// - **An empty graph never reaches the canvas.** A fresh project has one by
//   design (spec §Факт 9), and a blank rectangle would read as a bug.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { LearningGraph } from '../../../shared/ipc'
import { memoryById, STARMAP_EMPTY_HINT, toStarmapGraph } from './graph-adapter'
import { buildSimulation, type BuiltSim } from './vendor/hermes/simulation'
import { drawScene } from './vendor/hermes/render'
import { computePalette } from './vendor/hermes/color'
import { fitViewport } from './vendor/hermes/geometry'
import { countLabel, metaBadges } from './vendor/hermes/text'
import type { FadeBuckets, Viewport } from './vendor/hermes/types'
import { movedFar, panBy, pickNodeId, toWorld, zoomAt } from './viewport-pure'

function emptyFades(): FadeBuckets {
  return {
    appear: new Map(),
    labels: new Map(),
    links: new Map(),
    nodes: new Map(),
    rings: new Map()
  }
}

/** Neighbour sets, for the painter's "focus dims everything unrelated" pass.
 * Built once per graph rather than per frame. */
function buildAdjacency(edges: { source: string; target: string }[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  const link = (a: string, b: string): void => {
    const set = adjacency.get(a) ?? new Set<string>()
    set.add(b)
    adjacency.set(a, set)
  }
  for (const edge of edges) {
    link(edge.source, edge.target)
    link(edge.target, edge.source)
  }
  return adjacency
}

export default function StarmapTab(): JSX.Element {
  const [graph, setGraph] = useState<LearningGraph | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const mounted = useRef(true)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const simRef = useRef<BuiltSim | null>(null)
  const vpRef = useRef<Viewport>({ k: 1, x: 0, y: 0 })
  const hoverRef = useRef<string | null>(null)
  const focusRef = useRef<string | null>(null)
  const paletteVersion = useRef(0)
  /** Assigned by the render effect; a no-op until the canvas exists. */
  const scheduleRef = useRef<() => void>(() => {})

  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const result = await window.aecpilot.getLearningGraph()
      if (mounted.current) setGraph(result)
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
        setGraph({ nodes: [], memory: [] })
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    // Through a microtask so the effect body itself writes no state — the shape
    // this codebase already uses for a startup read
    // (`react-hooks/set-state-in-effect`).
    queueMicrotask(() => {
      if (mounted.current) void load()
    })
    return () => {
      mounted.current = false
    }
  }, [load])

  // A theme switch sets `data-theme` on the document root (theme.ts). Nothing
  // else tells the canvas, so it watches that attribute directly.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      paletteVersion.current += 1
      scheduleRef.current()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    return () => observer.disconnect()
  }, [])

  const starmap = useMemo(() => toStarmapGraph(graph ?? undefined), [graph])
  const memories = useMemo(() => memoryById(graph ?? undefined), [graph])
  const adjacency = useMemo(() => buildAdjacency(starmap.edges), [starmap])
  const hasNodes = starmap.nodes.length > 0

  const hovered = hoverId ? starmap.nodes.find((node) => node.id === hoverId) : undefined
  const selected = focusId ? starmap.nodes.find((node) => node.id === focusId) : undefined
  const shown = hovered ?? selected

  // Hover and selection reach the painter through refs, not through the
  // effect's dependency list: they change on every pointer move, and rebuilding
  // the simulation for a hover would re-settle the whole layout.
  useEffect(() => {
    hoverRef.current = hoverId
    focusRef.current = focusId
    scheduleRef.current()
  }, [hoverId, focusId])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !hasNodes) return

    const built = buildSimulation(starmap, () => schedule())
    simRef.current = built
    const fades = emptyFades()

    let disposed = false
    let frame = 0
    let palette = computePalette(canvas)
    let paletteAt = paletteVersion.current
    let fitted = false
    let size = { w: 0, h: 0 }
    const dpr = window.devicePixelRatio || 1

    function paint(): void {
      frame = 0
      const ctx = canvas?.getContext('2d')
      if (!ctx || disposed || size.w === 0 || size.h === 0) return

      if (canvas && paletteAt !== paletteVersion.current) {
        palette = computePalette(canvas)
        paletteAt = paletteVersion.current
      }

      const result = drawScene({
        adjacency,
        byId: built.byId,
        ctx,
        dpr,
        fades,
        focusId: focusRef.current,
        hoverId: hoverRef.current,
        hoverLink: null,
        hoverRing: null,
        links: built.links,
        memById: memories,
        nodes: built.nodes,
        palette,
        reveal: 1,
        rings: built.rings,
        selectedRing: null,
        size,
        vp: vpRef.current
      })

      // Keep the loop alive only while something is actually moving: the
      // simulation still cooling, or a fade still easing.
      if (result.animating || built.sim.alpha() > built.sim.alphaMin()) schedule()
    }

    function schedule(): void {
      if (disposed || frame !== 0) return
      frame = requestAnimationFrame(paint)
    }
    scheduleRef.current = schedule

    function resize(): void {
      const rect = wrap?.getBoundingClientRect()
      if (!canvas || !rect || rect.width === 0 || rect.height === 0) return
      size = { w: rect.width, h: rect.height }
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
      if (!fitted) {
        vpRef.current = fitViewport(rect.width, rect.height, built.rings.at(-1)?.r)
        fitted = true
      }
      schedule()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    resize()

    return () => {
      disposed = true
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
      scheduleRef.current = () => {}
      // The simulation owns a d3-timer; leaving it running would keep ticking a
      // graph nobody draws for as long as the window lives.
      built.sim.stop()
      simRef.current = null
    }
  }, [starmap, adjacency, memories, hasNodes])

  /** Pointer event → the node under it. The arithmetic lives in
   * `viewport-pure.ts`; this only supplies the canvas rect. */
  function nodeAt(event: { clientX: number; clientY: number }): string | null {
    const rect = canvasRef.current?.getBoundingClientRect()
    const built = simRef.current
    if (!rect || !built) return null
    const world = toWorld(vpRef.current, event.clientX - rect.left, event.clientY - rect.top)
    return pickNodeId(built.nodes, world, vpRef.current.k)
  }

  const dragRef = useRef<{ x: number; y: number } | null>(null)

  function fit(): void {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    vpRef.current = fitViewport(rect.width, rect.height, simRef.current?.rings.at(-1)?.r)
    scheduleRef.current()
  }

  return (
    <div className="starmap">
      <div className="starmap__toolbar">
        <span className="starmap__count">
          {hasNodes
            ? `Узлов: ${starmap.nodes.length} · связей: ${starmap.edges.length}`
            : 'Карта обучения'}
        </span>
        <button type="button" className="artifacts__btn" onClick={fit} disabled={!hasNodes}>
          Вписать
        </button>
        <button
          type="button"
          className="artifacts__btn"
          onClick={() => void load()}
          disabled={busy}
        >
          {busy ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      {error ? (
        <div className="artifacts__state artifacts__state--error" role="alert">
          <strong>Не удалось получить граф обучения</strong>
          <span>{error}</span>
          <button
            type="button"
            className="artifacts__btn"
            onClick={() => void load()}
            disabled={busy}
          >
            Повторить
          </button>
        </div>
      ) : graph === null ? (
        <div className="artifacts__state">Читаем граф обучения…</div>
      ) : !hasNodes ? (
        <div className="artifacts__state">{STARMAP_EMPTY_HINT}</div>
      ) : (
        <div className="starmap__stage" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="starmap__canvas"
            aria-label="Карта обучения агента"
            onWheel={(event) => {
              const rect = canvasRef.current?.getBoundingClientRect()
              if (!rect) return
              vpRef.current = zoomAt(
                vpRef.current,
                event.clientX - rect.left,
                event.clientY - rect.top,
                event.deltaY
              )
              scheduleRef.current()
            }}
            onPointerDown={(event) => {
              dragRef.current = { x: event.clientX, y: event.clientY }
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (drag) {
                vpRef.current = panBy(vpRef.current, event.clientX - drag.x, event.clientY - drag.y)
                dragRef.current = { x: event.clientX, y: event.clientY }
                scheduleRef.current()
                return
              }
              const id = nodeAt(event)
              if (id !== hoverRef.current) setHoverId(id)
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current
              dragRef.current = null
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              // A click is a drag that went nowhere — otherwise panning the map
              // would select whatever happened to sit under the release.
              if (drag && movedFar(drag, event.clientX, event.clientY)) return
              const id = nodeAt(event)
              setFocusId((current) => (current === id ? null : id))
            }}
            onPointerLeave={() => {
              dragRef.current = null
              setHoverId(null)
            }}
          />
          {shown && (
            <div className="starmap__tip" role="status">
              <div className="starmap__tip-title">{shown.label}</div>
              <div className="starmap__tip-meta">
                {metaBadges(shown).join(' · ')}
                {countLabel(shown) ? ` · ${countLabel(shown)}` : ''}
              </div>
              {shown.kind === 'memory' && memories.get(shown.id)?.body ? (
                <div className="starmap__tip-body">{memories.get(shown.id)?.body}</div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
