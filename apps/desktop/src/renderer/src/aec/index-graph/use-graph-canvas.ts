// Drawing a graph on the «Граф» tab (task 3L.9), the same for both views:
// sigma draws (WebGL), d3-force lays the picture out live, the search dims what
// does not match, and hovering a node leaves only it and its neighbours lit —
// the way Obsidian's graph behaves.
//
// sigma 4 (task T57): labels and the hover box are drawn in WebGL from display
// fields, not by a canvas callback. The theme's colours therefore travel through
// the node reducer (`labelColor`, `backdropColor`), and a search match is shown the
// way sigma 3 drew `highlighted`: its label and its box always on.

import type Graph from 'graphology'
import { type RefObject, useEffect, useRef } from 'react'
import type Sigma from 'sigma'
import type { NodeDisplayData } from 'sigma/types'

const DIM = '#d4d4d8'

export interface ThemeColors {
  background: string
  text: string
}

const transparent = (color: string): boolean =>
  !color || color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color)

/** The text colour of the canvas and the first solid background around it.
 *  sigma draws labels black and the hover box white unless told otherwise —
 *  black on the dark theme could not be read (task 3M.1, acceptance 46.6.1).
 *
 *  With their «glass» on — the default — every surface up to `<html>` is
 *  transparent and the window material shows through; the hover box then fell
 *  back to white under light text (acceptance 47.1.2). Their `bg-background`
 *  stays the theme's solid colour under glass, so that is the fallback. */
export function themeColors(element: Element): ThemeColors {
  const text = getComputedStyle(element).color || '#000'
  for (let at: Element | null = element; at; at = at.parentElement) {
    const background = getComputedStyle(at).backgroundColor
    if (!transparent(background)) return { background, text }
  }
  const probe = document.createElement('span')
  probe.className = 'bg-background'
  element.append(probe)
  const background = getComputedStyle(probe).backgroundColor
  probe.remove()
  return { background: transparent(background) ? '#fff' : background, text }
}

/** The theme's colours as sigma 4 display fields: the label in the theme's text,
 *  the box under a hovered node (sigma's «backdrop») in its background instead of
 *  the fixed white. */
export function themeDisplay(colors: ThemeColors): Partial<NodeDisplayData> {
  return { backdropColor: colors.background, labelColor: colors.text }
}

export interface CanvasHandlers {
  onClickEdge?: (edge: string) => void
  onClickNode?: (node: string) => void
  onClickStage?: () => void
}

/** How a node is shown, as changes to its display: dimmed and unlabelled when the
 *  search does not match it, or when another node is hovered and it is not a
 *  neighbour; a search match keeps its label and box on. `attributes` are the
 *  node's own (label, code) — sigma 4 gives the reducer them apart from the
 *  display data. */
export function nodeView(
  graph: Graph,
  node: string,
  attributes: Record<string, unknown>,
  query: string,
  hovered: null | string
): Partial<NodeDisplayData> {
  const needle = query.trim().toLowerCase()
  const matches =
    !needle ||
    String(attributes.label ?? '')
      .toLowerCase()
      .includes(needle) ||
    String(attributes.code ?? '')
      .toLowerCase()
      .includes(needle)
  const near = hovered === null || node === hovered || graph.areNeighbors(node, hovered)
  if (matches && near) {
    return needle
      ? { backdropVisibility: 'visible', highlighted: true, labelVisibility: 'visible' }
      : {}
  }
  return { color: DIM, label: '' }
}

/** While a node is hovered, only its own edges are drawn. */
export function edgeHidden(graph: Graph, edge: string, hovered: null | string): boolean {
  return hovered !== null && !graph.hasExtremity(edge, hovered)
}

export function useGraphCanvas(
  container: RefObject<HTMLDivElement | null>,
  graph: Graph | null,
  query: string,
  handlers: CanvasHandlers
): void {
  const handlersRef = useRef(handlers)
  const queryRef = useRef(query)
  const rendererRef = useRef<null | Sigma>(null)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    queryRef.current = query
    rendererRef.current?.refresh()
  }, [query])

  useEffect(() => {
    if (!graph || graph.order === 0) return
    let renderer: null | Sigma = null
    let stopLayout = (): void => {}
    let stopTheme = (): void => {}
    let stopResize = (): void => {}
    let hovered: null | string = null
    let cancelled = false
    // Loaded on first open of the tab: sigma touches WebGL as it loads, and the
    // page (and everything that imports it) must not pay for a tab not opened.
    void Promise.all([import('sigma'), import('d3-force')]).then(
      ([{ default: SigmaRenderer }, d3]) => {
        if (cancelled || !container.current) return
        const element = container.current
        let colors = themeColors(element)
        renderer = new SigmaRenderer(graph, element, {
          edgeReducer: (edge) => (edgeHidden(graph, edge, hovered) ? { visibility: 'hidden' } : {}),
          nodeReducer: (node, _data, attributes) => ({
            ...themeDisplay(colors),
            ...nodeView(graph, node, attributes, queryRef.current, hovered)
          }),
          settings: {
            // A collapsed panel leaves the box zero-sized for a moment; sigma
            // would throw instead of waiting for it to come back.
            allowInvalidContainer: true,
            enableEdgeEvents: true,
            // sigma 4 drags nodes by default; here d3-force owns the positions.
            enableNodeDrag: false,
            // sigma 4 measures node sizes in graph coordinates by default, so
            // the layout spreading out swelled every node; sigma 3 drew them in
            // screen pixels, as the sizes the views give are meant.
            itemSizesReference: 'screen',
            labelRenderedSizeThreshold: 6,
            renderEdgeLabels: false
          }
        })
        rendererRef.current = renderer
        renderer.on('clickNode', ({ node }) => handlersRef.current.onClickNode?.(node))
        renderer.on('clickEdge', ({ edge }) => handlersRef.current.onClickEdge?.(edge))
        renderer.on('clickStage', () => handlersRef.current.onClickStage?.())
        renderer.on('enterNode', ({ node }) => {
          hovered = node
          renderer?.refresh()
        })
        renderer.on('leaveNode', () => {
          hovered = null
          renderer?.refresh()
        })
        // The theme is the `dark` class on <html>; switching it repaints labels.
        const theme = new MutationObserver(() => {
          colors = themeColors(element)
          renderer?.refresh()
        })
        theme.observe(document.documentElement, { attributeFilter: ['class'], attributes: true })
        stopTheme = () => theme.disconnect()
        // sigma follows the window, not its box: a side panel or «Связаны через»
        // narrowed the box and the drawing stayed as wide as before, running out
        // of it (task 3M.2, acceptance 46.6.4).
        const size = new ResizeObserver(() => {
          renderer?.resize()
          renderer?.refresh()
        })
        size.observe(element)
        stopResize = () => size.disconnect()

        const nodes = graph.mapNodes((id, attributes) => ({
          id,
          x: Number(attributes.x) || 0,
          y: Number(attributes.y) || 0
        }))
        const at = new Map(nodes.map((node) => [node.id, node]))
        const links = graph.mapEdges((_edge, _attributes, source, target) => ({ source, target }))
        const simulation = d3
          .forceSimulation(nodes)
          .force(
            'link',
            d3
              .forceLink(links)
              .id((node) => (node as { id: string }).id)
              .distance(40)
          )
          .force('charge', d3.forceManyBody().strength(-80))
          .force('center', d3.forceCenter(0, 0))
          .force('collide', d3.forceCollide(10))
          .on('tick', () => {
            graph.updateEachNodeAttributes(
              (id, attributes) => ({ ...attributes, x: at.get(id)!.x, y: at.get(id)!.y }),
              { attributes: ['x', 'y'] }
            )
          })
        stopLayout = () => simulation.stop()
      }
    )
    return () => {
      cancelled = true
      stopLayout()
      stopTheme()
      stopResize()
      renderer?.kill()
      rendererRef.current = null
    }
  }, [graph, container])
}
