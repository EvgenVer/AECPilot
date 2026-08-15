// What the index holds, what is stale, and what a graph would cost
// (tasks 2.15 and 2.15a).
//
// Two numbers matter to an engineer and they are different questions. «Сколько
// проиндексировано» is about whether an answer can be trusted to have seen the
// documents. «Что входит в граф» is about money: adding a folder to the graph
// costs a model call per chunk (SPECIFICATION R6, measured in
// eval/graph-cost-report.md), so nothing is ever added on its own and the size
// of the spend is shown before the click, not after.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '../../donor/components/ui/popover'
import { useAecT } from '../../shared/i18n'
import type { IngestState } from '../../../../shared/ipc'

const IDLE: IngestState = { error: null, lastReport: null, progress: null, running: false }

export function IndexStatus(): React.JSX.Element | null {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [ingest, setIngest] = useState<IngestState>(IDLE)

  const status = useQuery({
    queryKey: ['aec', 'index-status'],
    queryFn: () => window.aecpilot.getIndexStatus()
  })

  // The state arrives by event, not by polling: an ingest is minutes long and
  // a poll either lags behind it or hammers a python process for nothing.
  useEffect(() => {
    void window.aecpilot.getIngestState().then(setIngest)
    return window.aecpilot.onIngestState((next) => {
      setIngest(next)
      // A finished run changes every number in the indicator.
      if (!next.running) void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
    })
  }, [queryClient])

  if (!status.data?.ok) return null
  const data = status.data.status

  const stale = data.stale_count
  const label = ingest.running
    ? t('index.running', ingest.progress?.done ?? 0, ingest.progress?.total ?? 0)
    : t('index.summary', data.files_indexed, data.files_total)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 text-xs"
          title={t('index.title')}
          type="button"
        >
          <span
            className={`codicon ${ingest.running ? 'codicon-sync' : 'codicon-database'}`}
            aria-hidden
          />
          <span>{label}</span>
          {stale > 0 && !ingest.running ? (
            <span className="text-amber-500">{t('index.stale', stale)}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-3 text-sm">
        <div className="space-y-1">
          <div className="font-medium">{t('index.title')}</div>
          <div className="text-muted-foreground">
            {t('index.summary', data.files_indexed, data.files_total)} ·{' '}
            {t('index.chunks', data.chunks_total)}
          </div>
          {data.last_ingest_at ? (
            <div className="text-muted-foreground text-xs">
              {t('index.lastRun', new Date(data.last_ingest_at).toLocaleString())}
            </div>
          ) : null}
          {stale > 0 ? (
            <div className="text-amber-500">{t('index.staleLong', stale)}</div>
          ) : (
            <div className="text-muted-foreground">{t('index.upToDate')}</div>
          )}
        </div>

        {ingest.error ? <div className="text-destructive">{ingest.error}</div> : null}
        {ingest.lastReport && ingest.lastReport.files_failed > 0 ? (
          <div className="text-amber-500">
            {t('index.failed', ingest.lastReport.files_failed)}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            disabled={ingest.running}
            onClick={() => void window.aecpilot.startIngest()}
            size="sm"
          >
            {ingest.running ? t('index.runningShort') : t('index.run')}
          </Button>
          <Button
            disabled={ingest.running}
            onClick={() => void window.aecpilot.startIngest(true)}
            size="sm"
            variant="outline"
          >
            {t('index.runFull')}
          </Button>
        </div>

        <GraphScope data={data} />
      </PopoverContent>
    </Popover>
  )
}

/** What the knowledge graph covers, and what adding to it would cost.
 *
 * Read-only on purpose in this phase: marking a folder is done by the agent
 * through `rag_graph_add`, and what UR24 требует here is that a person can see
 * what is in the graph, what is waiting, and how big the waiting work is —
 * before agreeing to it. */
function GraphScope({
  data
}: {
  data: NonNullable<Awaited<ReturnType<typeof window.aecpilot.getIndexStatus>> & { ok: true }>['status']
}): React.JSX.Element {
  const t = useAecT()
  const entries = data.graph_entries ?? []
  const pending = data.graph_pending

  return (
    <div className="border-border space-y-1 border-t pt-3">
      <div className="font-medium">{t('index.graphTitle')}</div>
      {data.graph.documents === 0 ? (
        <div className="text-muted-foreground">{t('index.graphEmpty')}</div>
      ) : (
        <div className="text-muted-foreground">
          {t('index.graphSummary', data.graph.documents, data.graph.chunks)}
        </div>
      )}
      {entries.length > 0 ? (
        <ul className="text-muted-foreground list-inside list-disc text-xs">
          {entries.map((entry) => (
            <li key={entry.path}>{entry.path}</li>
          ))}
        </ul>
      ) : null}
      {data.graph.documents > 0 && !data.graph.covers_whole_project ? (
        <div className="text-muted-foreground text-xs">
          {t('index.graphPartial', data.graph.documents_outside)}
        </div>
      ) : null}
      {pending.documents > 0 ? (
        <div className="text-amber-500">
          {t('index.graphPending', pending.documents, pending.chunks_estimate)}
        </div>
      ) : null}
    </div>
  )
}
