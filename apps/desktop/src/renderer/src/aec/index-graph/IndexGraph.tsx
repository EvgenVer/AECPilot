// The «Граф» tab of the Index page (task 3J.14, SPEC UR44). The owner added
// documents to the knowledge graph and had no way to see what came out; this
// draws it and answers «where does this come from?» with the documents, which
// open in the viewer.
//
// Two views (task 3L.9, owner decision 2026-10-12): «Документы» — the map of
// documents and what links them, the default, the graph as a person reads it;
// «Сущности» — entities as nodes, relations as edges. Both are laid out live
// and searched by name, and the area goes full screen.

import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { GraphExportNode } from '../../../../shared/ipc'
import { PROJECT_SOURCE_ID } from '../../../../shared/source-name'
import { CloseOnEscape } from '../CloseOnEscape'
import { openDocument } from '../viewers/viewer-store'
import { DocumentMap } from './DocumentMap'
import { toGraphology } from './graph-model'
import { RebuildGraph } from './RebuildGraph'
import { useGraphCanvas } from './use-graph-canvas'

type View = 'documents' | 'entities'

export function IndexGraph(): React.JSX.Element {
  const t = useAecT()
  const [view, setView] = useState<View>('documents')
  const [query, setQuery] = useState('')
  // «На весь экран» — слой поверх всего окна, а не полноэкранный режим ОС:
  // разрешение `fullscreen` политика 3.7a держит закрытым намеренно
  // (`media-permission-pure.ts`), а окно приложения и есть экран человека.
  const [full, setFull] = useState(false)

  return (
    <div
      aria-label={full ? t('index.graph.canvasFull') : undefined}
      className={`space-y-2 text-sm ${full ? 'bg-background fixed inset-0 z-(--z-modal) overflow-auto p-3' : ''}`}
      data-testid="index-graph-area"
      role={full ? 'dialog' : undefined}
    >
      {full ? <CloseOnEscape onClose={() => setFull(false)} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <div aria-label={t('index.graph.view')} className="flex gap-1" role="group">
          {(['documents', 'entities'] as const).map((value) => (
            <Button
              aria-pressed={view === value}
              key={value}
              onClick={() => setView(value)}
              size="sm"
              variant={view === value ? 'secondary' : 'ghost'}
            >
              {value === 'documents'
                ? t('index.graph.viewDocuments')
                : t('index.graph.viewEntities')}
            </Button>
          ))}
        </div>
        <input
          aria-label={t('index.graph.search')}
          className="bg-background border-border min-w-0 flex-1 rounded border px-2 py-0.5 text-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('index.graph.search')}
          type="search"
          value={query}
        />
        <Button onClick={() => setFull(!full)} size="sm" variant="ghost">
          {full ? t('index.graph.exitFullscreen') : t('index.graph.fullscreen')}
        </Button>
      </div>
      <RebuildGraph />
      {view === 'documents' ? (
        <DocumentMap full={full} query={query} />
      ) : (
        <EntityGraph full={full} query={query} />
      )}
    </div>
  )
}

type DocumentKey = { rel: string; sourceId: string }

/** «Сущности»: the entities of the graph, narrowed by document (3J.14). */
function EntityGraph({ full, query }: { full: boolean; query: string }): React.JSX.Element {
  const t = useAecT()
  const [document, setDocument] = useState<DocumentKey | null>(null)
  const [selected, setSelected] = useState<GraphExportNode | null>(null)
  const container = useRef<HTMLDivElement>(null)

  const result = useQuery({
    queryKey: ['aec', 'index-status', 'graph-export', document?.sourceId, document?.rel],
    queryFn: () => window.aecpilot.exportGraph(document ?? undefined)
  })
  const data = result.data?.ok ? result.data.graph : null
  const graph = useMemo(() => (data && data.nodes.length > 0 ? toGraphology(data) : null), [data])
  const byId = useMemo(() => new Map((data?.nodes ?? []).map((node) => [node.id, node])), [data])

  useGraphCanvas(container, graph, query, {
    onClickNode: (node) => setSelected(byId.get(node) ?? null),
    onClickStage: () => setSelected(null)
  })

  if (result.data && !result.data.ok) {
    return (
      <div className="text-destructive text-sm">
        {t('index.graph.loadFailed', result.data.error)}
      </div>
    )
  }
  if (!data) return <div className="text-muted-foreground text-sm">{t('index.graph.loading')}</div>
  if (!data.graph_exists || data.total_nodes === 0) {
    return <div className="text-muted-foreground text-sm">{t('index.graph.empty')}</div>
  }

  const documentValue = document ? `${document.sourceId}/${document.rel}` : ''

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground">
        {data.truncated
          ? t('index.graph.shownPart', data.nodes.length, data.matched_nodes, data.total_nodes)
          : t('index.graph.shownAll', data.nodes.length, data.edges.length)}
      </div>
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
          className={`border-border min-w-0 flex-1 rounded border ${full ? 'h-[calc(100vh-9rem)]' : 'h-[480px]'}`}
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
