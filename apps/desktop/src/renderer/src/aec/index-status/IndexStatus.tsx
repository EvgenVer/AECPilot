// What the index holds, what is stale, and what a graph would cost
// (tasks 2.15 and 2.15a).
//
// Two numbers matter to an engineer and they are different questions. «Сколько
// проиндексировано» is about whether an answer can be trusted to have seen the
// documents. «Что входит в граф» is about money: adding a folder to the graph
// costs a model call per chunk (SPECIFICATION R6, measured in
// eval/graph-cost-report.md), so nothing is ever added on its own and the size
// of the spend is shown before the click, not after.
//
// Задача 3H.10 (UR43): подробности живут на странице «Индекс», а не во
// всплывающей панели строки состояния — строку донор прячет в простом режиме и по
// Ctrl+Shift+S, и вместе с ней пропадал единственный вход (D-189). Значок в строке
// остаётся, пока она видна, и ведёт на ту же страницу.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { GraphAddState, IngestFileRow, IngestState } from '../../../../shared/ipc'
import { $dataProviders, openDataProviders } from '../data-providers/store'
import { openIndexPage } from '../workspace-pages'

const IDLE: IngestState = {
  error: null,
  files: [],
  interrupted: null,
  lastReport: null,
  progress: null,
  running: false,
  stopping: false
}

// Задача 5.15: графовый прогон идёт минутами и стоит денег, а окно, из которого
// его запустили, человек вправе закрыть. Значит ход должен быть виден там же,
// где всё остальное про индекс, — иначе расход становится невидимым.
const GRAPH_IDLE: GraphAddState = {
  error: null,
  lastReport: null,
  path: null,
  progress: null,
  running: false
}

type IndexData = NonNullable<
  Awaited<ReturnType<typeof window.aecpilot.getIndexStatus>> & { ok: true }
>['status']

/** Всё, что значок и страница знают об индексе. Одно место на двоих: значок и
 *  страница могут стоять на экране одновременно и не должны расходиться. */
function useIndexState(): {
  data: IndexData | null
  ingest: IngestState
  graph: GraphAddState
  pendingSwitch: { from: string; to: string } | null
  providerGap: string | null
} {
  const queryClient = useQueryClient()
  const [ingest, setIngest] = useState<IngestState>(IDLE)
  const [graph, setGraph] = useState<GraphAddState>(GRAPH_IDLE)

  const status = useQuery({
    queryKey: ['aec', 'index-status'],
    queryFn: () => window.aecpilot.getIndexStatus()
  })
  // Задача 3G.7: провайдер сменил модель эмбеддингов. Вопрос задаётся ДО того, как
  // индекс тронут: перестройка — только по кнопке, с названной ценой.
  const embeddingSwitch = useQuery({
    queryKey: ['aec', 'index-status', 'embedding-switch'],
    queryFn: () => window.aecpilot.getEmbeddingSwitch()
  })
  // Задача 3G.49 (D-172): провайдера у поиска нет (агент по подписке без выбора) —
  // причина словами и вход в окно выбора, а не немой отказ индексации.
  const dataProviders = useQuery({
    queryKey: ['aec', 'index-status', 'data-providers'],
    queryFn: () => window.aecpilot.getDataProviders()
  })
  const providerGap =
    dataProviders.data?.profileRead && !dataProviders.data.rag.ok
      ? (dataProviders.data.rag.reason ?? '')
      : null

  // Выбор сохранён в окне — и причина, и модель эмбеддингов (3G.7) читаются заново.
  useEffect(
    () =>
      $dataProviders.listen(
        () => void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
      ),
    [queryClient]
  )

  // The state arrives by event, not by polling: an ingest is minutes long and
  // a poll either lags behind it or hammers a python process for nothing.
  useEffect(() => {
    void window.aecpilot.getIngestState().then(setIngest)
    return window.aecpilot.onIngestState((next) => {
      setIngest(next)
      // A finished run changes every number in the indicator (and, after a
      // rebuild, the model the index was built with — same query-key prefix).
      if (!next.running) void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
    })
  }, [queryClient])

  useEffect(() => {
    void window.aecpilot.getGraphAddState().then(setGraph)
    return window.aecpilot.onGraphAddState((next) => {
      setGraph(next)
      if (!next.running) void queryClient.invalidateQueries({ queryKey: ['aec', 'index-status'] })
    })
  }, [queryClient])

  return {
    data: status.data?.ok ? status.data.status : null,
    ingest,
    graph,
    pendingSwitch: embeddingSwitch.data ?? null,
    providerGap
  }
}

/** Значок строки состояния: сводка в одну строку, щелчок — страница «Индекс». */
export function IndexStatus(): React.JSX.Element | null {
  const t = useAecT()
  const { data, ingest, pendingSwitch, providerGap } = useIndexState()

  if (!data) return null

  const stale = data.stale_count
  const label = ingest.running
    ? t('index.running', ingest.progress?.done ?? 0, ingest.progress?.total ?? 0)
    : t('index.summary', data.files_indexed, data.files_total)

  return (
    <button
      className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 text-xs"
      onClick={openIndexPage}
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
      {(pendingSwitch || providerGap !== null) && !ingest.running ? (
        <span className="codicon codicon-warning text-amber-500" aria-hidden />
      ) : null}
    </button>
  )
}

/** Тело страницы «Индекс»: что прочитано, что устарело, кнопки прогона и граф. */
export function IndexDetails(): React.JSX.Element | null {
  const t = useAecT()
  const { data, ingest, graph, pendingSwitch, providerGap } = useIndexState()

  if (!data) return null

  const stale = data.stale_count

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
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

      {pendingSwitch && !ingest.running ? (
        <div className="space-y-2 rounded border border-amber-500/50 p-2" role="alert">
          <div className="text-amber-500">
            {t(
              'index.embeddingSwitch',
              pendingSwitch.from,
              pendingSwitch.to,
              data.chunks_total,
              data.graph.documents
            )}
          </div>
          <Button onClick={() => void window.aecpilot.startIngest(true, true)} size="sm">
            {t('index.rebuild')}
          </Button>
        </div>
      ) : null}
      {providerGap !== null ? (
        <div className="space-y-2 rounded border border-amber-500/50 p-2" role="alert">
          <div className="text-amber-500">{t('index.provider', providerGap)}</div>
          <Button onClick={openDataProviders} size="sm">
            {t('index.providerChoose')}
          </Button>
        </div>
      ) : null}
      {ingest.running ? <RunStage progress={ingest.progress} /> : null}
      {!ingest.running && (data.pages_pending ?? 0) > 0 ? (
        <div className="text-amber-500">{t('index.pagesPending', data.pages_pending ?? 0)}</div>
      ) : null}
      {ingest.error ? <div className="text-destructive">{ingest.error}</div> : null}
      {!ingest.running && ingest.lastReport?.stopped ? (
        <div className="text-muted-foreground">{t('index.stopped')}</div>
      ) : null}
      {!ingest.running && ingest.interrupted ? (
        <div className="text-amber-500" role="status">
          {t('index.interrupted', ingest.interrupted.rel_path)}
        </div>
      ) : null}
      {ingest.lastReport && ingest.lastReport.files_failed > 0 ? (
        <div className="text-amber-500">{t('index.failed', ingest.lastReport.files_failed)}</div>
      ) : null}
      {!ingest.running && (ingest.lastReport?.pages_recognized ?? 0) > 0 ? (
        <div className="text-muted-foreground">
          {t('index.recognized', ingest.lastReport?.pages_recognized ?? 0)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
        {/* Задача 3H.16: остановка между файлами и страницами — готовое
            остаётся, следующий прогон продолжает. */}
        {ingest.running ? (
          <Button
            disabled={ingest.stopping}
            onClick={() => void window.aecpilot.cancelIngest()}
            size="sm"
            variant="outline"
          >
            {ingest.stopping ? t('index.stopping') : t('index.stop')}
          </Button>
        ) : null}
        <Button onClick={openDataProviders} size="sm" variant="ghost">
          {t('index.providerOpen')}
        </Button>
      </div>

      <RunFiles files={ingest.files} />

      <GraphScope data={data} graph={graph} />
    </div>
  )
}

/** Где сейчас прогон (задача 3H.15): первый проход считает файлы, второй —
 *  ещё и страницы файла, потому что распознавание идёт секундами на страницу. */
function RunStage({ progress }: { progress: IngestState['progress'] }): React.JSX.Element {
  const t = useAecT()
  const done = progress?.done ?? 0
  const total = progress?.total ?? 0

  return (
    <div className="text-muted-foreground" role="status">
      {progress?.phase === 'ocr'
        ? t('index.runningOcr', done, total, progress.page ?? 0, progress.pages ?? 0)
        : t('index.runningText', done, total)}
    </div>
  )
}

/** Файлы прогона с их состоянием (задача 3H.19). Пусто — прогона ещё не было. */
function RunFiles({ files }: { files: IngestFileRow[] }): React.JSX.Element | null {
  const t = useAecT()
  if (files.length === 0) return null

  const label = (row: IngestFileRow): string => {
    switch (row.state) {
      case 'reading':
        return t('index.fileReading')
      case 'waiting':
        return t('index.fileWaiting', row.pagesWaiting)
      case 'recognizing':
        return t('index.fileRecognizing', row.pagesDone, row.pagesWaiting)
      case 'done':
        return t('index.fileDone')
      case 'failed':
        return t('index.fileFailed', row.error)
      case 'skipped':
        return t('index.fileSkipped')
      default:
        return t('index.fileRead')
    }
  }

  return (
    <div className="border-border space-y-1 border-t pt-3">
      <div className="font-medium">{t('index.filesTitle')}</div>
      <ul aria-label={t('index.filesTitle')} className="space-y-0.5 text-xs">
        {files.map((row) => (
          <li className="flex gap-2" key={`${row.source_id}/${row.rel_path}`}>
            <span className="min-w-0 flex-1 truncate" title={row.rel_path}>
              {row.rel_path}
            </span>
            <span
              className={
                row.state === 'failed'
                  ? 'text-destructive shrink-0'
                  : row.state === 'waiting' || row.state === 'recognizing'
                    ? 'shrink-0 text-amber-500'
                    : 'text-muted-foreground shrink-0'
              }
            >
              {label(row)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the knowledge graph covers, and what adding to it would cost.
 *
 * Read-only on purpose in this phase: marking a folder is done by the agent
 * through `rag_graph_add`, and what UR24 требует here is that a person can see
 * what is in the graph, what is waiting, and how big the waiting work is —
 * before agreeing to it. */
function GraphScope({ data, graph }: { data: IndexData; graph: GraphAddState }): React.JSX.Element {
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
      {graph.running ? (
        <div className="text-amber-500">
          {t('index.graphRunning', graph.progress?.done ?? 0, graph.progress?.total ?? 0)}
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
