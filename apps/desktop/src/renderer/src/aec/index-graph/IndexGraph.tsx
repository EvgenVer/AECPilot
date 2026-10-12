// The «Граф» tab of the Index page (task 3J.14, SPEC UR44). The owner added
// documents to the knowledge graph and had no way to see what came out; this
// draws it — entities as nodes, relations as edges — and answers «where does
// this come from?» with the documents, which open in the viewer.
//
// The layout is computed by `aec-rag graph-export` in Python; sigma only draws
// (WebGL), so a few hundred nodes stay smooth.

import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type Sigma from 'sigma'

import { useAecT } from '../../shared/i18n'
import type { GraphExportNode } from '../../../../shared/ipc'
import { PROJECT_SOURCE_ID } from '../../../../shared/source-name'
import { openDocument } from '../viewers/viewer-store'
import { toGraphology } from './graph-model'
import { RebuildGraph } from './RebuildGraph'

type DocumentKey = { rel: string; sourceId: string }

export function IndexGraph(): React.JSX.Element {
  const t = useAecT()
  const [document, setDocument] = useState<DocumentKey | null>(null)
  const [selected, setSelected] = useState<GraphExportNode | null>(null)
  const container = useRef<HTMLDivElement>(null)

  const query = useQuery({
    queryKey: ['aec', 'index-status', 'graph-export', document?.sourceId, document?.rel],
    queryFn: () => window.aecpilot.exportGraph(document ?? undefined)
  })
  const data = query.data?.ok ? query.data.graph : null

  useEffect(() => {
    if (!data || data.nodes.length === 0) return
    const byId = new Map(data.nodes.map((node) => [node.id, node]))
    // Loaded on first open of the tab: sigma touches WebGL as it loads, and the
    // page (and everything that imports it) must not pay for a tab not opened.
    let renderer: null | Sigma = null
    let cancelled = false
    void import('sigma').then(({ default: SigmaRenderer }) => {
      if (cancelled || !container.current) return
      renderer = new SigmaRenderer(toGraphology(data), container.current, {
        labelRenderedSizeThreshold: 6,
        renderEdgeLabels: false
      })
      renderer.on('clickNode', ({ node }) => setSelected(byId.get(node) ?? null))
      renderer.on('clickStage', () => setSelected(null))
    })
    return () => {
      cancelled = true
      renderer?.kill()
    }
  }, [data])

  if (query.data && !query.data.ok) {
    return (
      <div className="text-destructive text-sm">
        {t('index.graph.loadFailed', query.data.error)}
      </div>
    )
  }
  if (!data) return <div className="text-muted-foreground text-sm">{t('index.graph.loading')}</div>
  if (!data.graph_exists || data.total_nodes === 0) {
    return <div className="text-muted-foreground text-sm">{t('index.graph.empty')}</div>
  }

  const documentValue = document ? `${document.sourceId}/${document.rel}` : ''

  return (
    <div className="space-y-2 text-sm">
      <div className="text-muted-foreground">
        {data.truncated
          ? t('index.graph.shownPart', data.nodes.length, data.matched_nodes, data.total_nodes)
          : t('index.graph.shownAll', data.nodes.length, data.edges.length)}
      </div>
      <RebuildGraph />
      <label className="flex items-center gap-2 text-xs">
        {t('index.graph.document')}
        <select
          className="bg-background border-border min-w-0 flex-1 rounded border px-1 py-0.5"
          onChange={(event) => {
            const value = event.target.value
            const slash = value.indexOf('/')
            setSelected(null)
            setDocument(
              value ? { rel: value.slice(slash + 1), sourceId: value.slice(0, slash) } : null
            )
          }}
          value={documentValue}
        >
          <option value="">{t('index.graph.allDocuments')}</option>
          {data.documents.map((doc) => (
            <option
              key={`${doc.source_id}/${doc.rel_path}`}
              value={`${doc.source_id}/${doc.rel_path}`}
            >
              {t('index.graph.documentOption', doc.rel_path, doc.entities)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <div
          aria-label={t('index.graph.canvas')}
          className="border-border h-[480px] min-w-0 flex-1 rounded border"
          data-testid="index-graph-canvas"
          ref={container}
          role="img"
        />
        {selected ? <Entity entity={selected} /> : null}
      </div>
      {!selected && data.nodes.length > 0 ? (
        <div className="text-muted-foreground text-xs">{t('index.graph.hint')}</div>
      ) : null}
    </div>
  )
}

/** What a person asks of an entity: what it is and which documents it is from. */
function Entity({ entity }: { entity: GraphExportNode }): React.JSX.Element {
  const t = useAecT()
  return (
    <aside aria-label={entity.label} className="w-64 shrink-0 space-y-2 text-xs">
      <div className="text-sm font-medium">{entity.label}</div>
      {entity.type ? <div className="text-muted-foreground">{entity.type}</div> : null}
      {entity.description ? <p>{entity.description}</p> : null}
      <div className="font-medium">{t('index.graph.documents')}</div>
      {entity.documents.length === 0 ? (
        <div className="text-muted-foreground">{t('index.graph.noDocuments')}</div>
      ) : (
        <ul className="space-y-0.5">
          {entity.documents.map((doc) => (
            <li key={`${doc.source_id}/${doc.rel_path}`}>
              <button
                className="text-left underline-offset-2 hover:underline"
                onClick={() =>
                  openDocument({ locator: {}, relPath: doc.rel_path, sourceId: doc.source_id })
                }
                title={`[src: ${doc.source_id}/${doc.rel_path}]`}
                type="button"
              >
                {doc.source_id === PROJECT_SOURCE_ID ? `${t('citations.projectFile')}: ` : ''}
                {doc.rel_path}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
