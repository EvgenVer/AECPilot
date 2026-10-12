// Drawing a graph on the «Граф» tab (task 3L.9), the same for both views:
// sigma draws (WebGL), d3-force lays the picture out live, the search dims what
// does not match, and hovering a node leaves only it and its neighbours lit —
// the way Obsidian's graph behaves.

import type Graph from 'graphology'
import { type RefObject, useEffect, useRef } from 'react'
import type Sigma from 'sigma'

const DIM = '#d4d4d8'

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
    let hovered: null | string = null
    let cancelled = false
    // Loaded on first open of the tab: sigma touches WebGL as it loads, and the
    // page (and everything that imports it) must not pay for a tab not opened.
    void Promise.all([import('sigma'), import('d3-force')]).then(
      ([{ default: SigmaRenderer }, d3]) => {
        if (cancelled || !container.current) return
        renderer = new SigmaRenderer(graph, container.current, {
          edgeReducer: (edge, data) =>
            edgeHidden(graph, edge, hovered) ? { ...data, hidden: true } : data,
          enableEdgeEvents: true,
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
      renderer?.kill()
      rendererRef.current = null
    }
  }, [graph, container])
}
