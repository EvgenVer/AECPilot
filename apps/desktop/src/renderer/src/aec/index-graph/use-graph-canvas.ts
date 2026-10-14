// Drawing a graph on the «Граф» tab (task 3L.9), the same for both views:
// sigma draws (WebGL), d3-force lays the picture out live, the search dims what
// does not match, and hovering a node leaves only it and its neighbours lit —
// the way Obsidian's graph behaves.

import type Graph from 'graphology'
import { type RefObject, useEffect, useRef } from 'react'
import type Sigma from 'sigma'
import type { NodeHoverDrawingFunction } from 'sigma/rendering'

const DIM = '#d4d4d8'

export interface ThemeColors {
  background: string
  text: string
}

const transparent = (color: string): boolean =>
  !color || color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color)

/** The text colour of the canvas and the first solid background around it.
 *  sigma draws labels black and the hover box white unless told otherwise —
 *  black on the dark theme could not be read (task 3M.1, acceptance 46.6.1). */
export function themeColors(element: Element): ThemeColors {
  const text = getComputedStyle(element).color || '#000'
  for (let at: Element | null = element; at; at = at.parentElement) {
    const background = getComputedStyle(at).backgroundColor
    if (!transparent(background)) return { background, text }
  }
  return { background: '#fff', text }
}

/** sigma's hover — a box under the hovered node and its label — in the theme's
 *  colours instead of its fixed white. */
export function drawHover(colors: () => ThemeColors): NodeHoverDrawingFunction {
  return (context, data, settings) => {
    const size = settings.labelSize
    const padding = 2
    const { background, text } = colors()
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`
    context.fillStyle = background
    context.shadowBlur = 8
    context.shadowColor = 'rgba(0, 0, 0, 0.5)'
    context.beginPath()
    context.arc(data.x, data.y, data.size + padding, 0, Math.PI * 2)
    context.fill()
    if (data.label) {
      const width = context.measureText(data.label).width + 5
      context.fillRect(
        data.x + data.size,
        data.y - size / 2 - padding,
        width + 3,
        size + 2 * padding
      )
    }
    context.shadowBlur = 0
    if (!data.label) return
    context.fillStyle = text
    context.fillText(data.label, data.x + data.size + 3, data.y + size / 3)
  }
}

export interface CanvasHandlers {
  onClickEdge?: (edge: string) => void
  onClickNode?: (node: string) => void
  onClickStage?: () => void
}

/** How a node is shown: dimmed and unlabelled when the search does not match
 *  it, or when another node is hovered and it is not a neighbour. */
export function nodeView(
  graph: Graph,
  node: string,
  data: Record<string, unknown>,
  query: string,
  hovered: null | string
): Record<string, unknown> {
  const needle = query.trim().toLowerCase()
  const matches =
    !needle ||
    String(data.label ?? '')
      .toLowerCase()
      .includes(needle) ||
    String(data.code ?? '')
      .toLowerCase()
      .includes(needle)
  const near = hovered === null || node === hovered || graph.areNeighbors(node, hovered)
  if (matches && near) return needle ? { ...data, highlighted: true } : data
  return { ...data, color: DIM, label: '' }
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
          defaultDrawNodeHover: drawHover(() => colors),
          edgeReducer: (edge, data) =>
            edgeHidden(graph, edge, hovered) ? { ...data, hidden: true } : data,
          enableEdgeEvents: true,
          labelColor: { color: colors.text },
          labelRenderedSizeThreshold: 6,
          nodeReducer: (node, data) => nodeView(graph, node, data, queryRef.current, hovered),
          renderEdgeLabels: false
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
          renderer?.setSetting('labelColor', { color: colors.text })
        })
        theme.observe(document.documentElement, { attributeFilter: ['class'], attributes: true })
        stopTheme = () => theme.disconnect()

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
      renderer?.kill()
      rendererRef.current = null
    }
  }, [graph, container])
}
