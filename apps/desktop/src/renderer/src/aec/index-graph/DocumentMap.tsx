// «Документы» on the «Граф» tab (task 3L.9, owner decision 2026-10-12): the
// graph for a person is a map of documents, as in Obsidian — a node is a
// document, an edge is what links two of them. A click on an edge answers
// «связаны через что» with places that open in the viewer; a click on a
// document opens it.

import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'

import { useAecT } from '../../shared/i18n'
import type {
  GraphDocumentEdge,
  GraphDocumentNode,
  GraphDocumentPlace
} from '../../../../shared/ipc'
import { openDocument } from '../viewers/viewer-store'
import { toDocumentGraph } from './document-map-model'
import { useGraphCanvas } from './use-graph-canvas'

export function DocumentMap({ full, query }: { full: boolean; query: string }): React.JSX.Element {
  const t = useAecT()
  const container = useRef<HTMLDivElement>(null)
  const [link, setLink] = useState<GraphDocumentEdge | null>(null)

  const result = useQuery({
    queryKey: ['aec', 'index-status', 'graph-documents'],
    queryFn: () => window.aecpilot.exportDocumentMap()
  })
  const map = result.data?.ok ? result.data.map : null
  const graph = useMemo(() => (map && map.nodes.length > 0 ? toDocumentGraph(map) : null), [map])
  const byId = useMemo(() => new Map((map?.nodes ?? []).map((node) => [node.id, node])), [map])

  useGraphCanvas(container, graph, query, {
    onClickEdge: (edge) => setLink(map?.edges[Number(edge)] ?? null),
    onClickNode: (node) => {
      const document = byId.get(node)
      if (document) {
        openDocument({ locator: {}, relPath: document.rel_path, sourceId: document.source_id })
      }
    },
    onClickStage: () => setLink(null)
  })

  if (result.data && !result.data.ok) {
    return (
      <div className="text-destructive text-sm">
        {t('index.graph.loadFailed', result.data.error)}
      </div>
    )
  }
  if (!map) return <div className="text-muted-foreground text-sm">{t('index.graph.loading')}</div>
  if (!map.graph_exists || map.nodes.length === 0) {
    return <div className="text-muted-foreground text-sm">{t('index.graph.empty')}</div>
  }

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground">
        {t('index.graph.documentsShown', map.nodes.length, map.edges.length)}
      </div>
      <div className="flex gap-3">
        <div
          aria-label={t('index.graph.mapCanvas')}
          className={`border-border min-w-0 flex-1 rounded border ${full ? 'h-[calc(100vh-7rem)]' : 'h-[480px]'}`}
          data-testid="index-graph-canvas"
          ref={container}
          role="img"
        />
        {link ? <LinkPanel byId={byId} link={link} /> : null}
      </div>
      {!link ? (
        <div className="text-muted-foreground text-xs">{t('index.graph.mapHint')}</div>
      ) : null}
    </div>
  )
}

/** «Связаны через»: the shared entities with their places, or the mention. */
function LinkPanel({
  byId,
  link
}: {
  byId: Map<string, GraphDocumentNode>
  link: GraphDocumentEdge
}): React.JSX.Element {
  const t = useAecT()
  const name = (id: string): string => byId.get(id)?.label ?? id
  return (
    <aside
      aria-label={t('index.graph.linkedThrough')}
      className="max-h-[480px] w-72 shrink-0 space-y-2 overflow-auto text-xs"
    >
      <div className="text-sm font-medium">
        {name(link.source)} — {name(link.target)}
      </div>
      {link.kind === 'refers' ? (
        <>
          <div>{t('index.graph.refers', name(link.source), name(link.target), link.code)}</div>
          <div className="font-medium">{t('index.graph.mentions')}</div>
          <Places places={link.places} />
        </>
      ) : (
        <>
          <div className="font-medium">{t('index.graph.linkedThrough')}</div>
          <div className="text-muted-foreground">
            {t('index.graph.sharedEntities', link.weight)}
          </div>
          <ul className="space-y-1.5">
            {link.entities.map((entity) => (
              <li key={entity.label}>
                <div>
                  {entity.label}
                  {entity.type ? (
                    <span className="text-muted-foreground"> · {entity.type}</span>
                  ) : null}
                </div>
                <Places places={entity.places} />
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}

function Places({ places }: { places: GraphDocumentPlace[] }): React.JSX.Element {
  const t = useAecT()
  return (
    <ul className="space-y-0.5 pl-2">
      {places.map((place) => (
        <li key={place.chunk_id}>
          <button
            className="text-left underline-offset-2 hover:underline"
            onClick={() =>
              openDocument({
                locator: place.locator,
                relPath: place.rel_path,
                sourceId: place.source_id
              })
            }
            title={`[src: ${place.source_id}/${place.rel_path}]`}
            type="button"
          >
            {t(
              'index.graph.place',
              place.rel_path.split('/').pop() ?? place.rel_path,
              place.locator.page ?? null
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
