// Connected sources — the read-only folders the agent may look at through the
// `aec-sources` MCP server, never through its own file tools (SPEC N3/AC6).
// Ours entirely: the donor has no concept of a source.
//
// Task 1.8.17, second slice. What this screen owes the user, from
// specs/workspace-sources.md: adding a folder can come back asking for
// confirmation (it overlaps another source, or is unreachable right now), and
// an already-connected source can become unreachable later — a moved drive, a
// disconnected share — which has to be visible without expanding anything.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import { useAecT } from '../../shared/i18n'
import type { ProjectSource, SourceTreeNode } from '../../../../shared/ipc'

import { openDocument } from '../viewers/viewer-store'

const SOURCES_KEY = ['aec', 'sources'] as const

/** Reachability per source id, filled in after the list arrives. */
type Statuses = Record<string, 'ok' | 'unavailable' | 'error'>

/** One source's files, read only when the user opens it — a source can be a
 * network share with tens of thousands of entries, and nothing about the panel
 * needs them until someone looks. */
function SourceTree({ sourceId }: { sourceId: string }) {
  const t = useAecT()
  const { data } = useQuery({
    queryKey: [...SOURCES_KEY, 'tree', sourceId],
    queryFn: () => window.aecpilot.getSourceTree(sourceId)
  })

  if (!data)
    return <div className="pl-5 text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
  if (!data.ok) return <div className="pl-5 text-xs text-destructive">{data.error}</div>
  if (data.status === 'unavailable') {
    return <div className="pl-5 text-xs text-destructive">{t('sources.unavailable')}</div>
  }

  return <SourceNodes depth={1} nodes={data.tree} sourceId={sourceId} />
}

function SourceNodes({
  nodes,
  depth,
  sourceId
}: {
  nodes: SourceTreeNode[]
  depth: number
  sourceId: string
}) {
  const t = useAecT()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <li key={node.path}>
          <div
            className="group flex items-center gap-1 rounded-[4px] pr-1 hover:bg-(--chrome-action-hover)"
            style={{ paddingLeft: `${depth * 0.75}rem` }}
          >
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-0.5 text-left text-xs"
              // Задача 4.2a: файл источника открывается тем же просмотрщиком.
              // Открывается — не правится: источники read-only (SPEC UR2, AC6).
              onClick={() =>
                node.type === 'dir'
                  ? setOpen((c) => ({ ...c, [node.path]: !c[node.path] }))
                  : openDocument({ locator: {}, relPath: node.path, sourceId })
              }
              title={node.path}
              type="button"
            >
              <Codicon
                className="text-(--ui-text-secondary)"
                name={
                  node.type === 'dir'
                    ? open[node.path]
                      ? 'chevron-down'
                      : 'chevron-right'
                    : 'file'
                }
              />
              <span className="truncate">{node.name}</span>
            </button>
            <Button
              aria-label={t('explorer.reveal')}
              className="hidden group-focus-within:flex group-hover:flex"
              onClick={() => void window.aecpilot.showSourceEntryInExplorer(sourceId, node.path)}
              size="icon-xs"
              title={t('explorer.reveal')}
              variant="ghost"
            >
              <Codicon name="folder-opened" />
            </Button>
          </div>
          {node.type === 'dir' && open[node.path] && (
            <SourceNodes depth={depth + 1} nodes={node.children ?? []} sourceId={sourceId} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function SourcesPanel() {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // A pending add that main answered with `needsConfirm`: the warnings to show
  // and the path to re-submit unchanged.
  const [confirmAdd, setConfirmAdd] = useState<
    { rootPath: string; warnings: string[] } | undefined
  >(undefined)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const { data: sources } = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: () => window.aecpilot.listSources()
  })

  // Status is a second, cheaper call per source — kept separate so a slow or
  // dead share delays a badge, not the list.
  const { data: statuses } = useQuery({
    queryKey: [...SOURCES_KEY, 'status', (sources ?? []).map((source) => source.id).join(',')],
    enabled: sources !== undefined,
    queryFn: async (): Promise<Statuses> => {
      const entries = await Promise.all(
        (sources ?? []).map(async (source) => {
          const result = await window.aecpilot.getSourceStatus(source.id)
          return [source.id, result.ok ? result.status : 'error'] as const
        })
      )
      return Object.fromEntries(entries)
    }
  })

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
    [queryClient]
  )

  const submitAdd = useCallback(
    async (rootPath: string, confirmed: boolean) => {
      setBusy(true)
      setError(undefined)
      try {
        const result = await window.aecpilot.addSource(rootPath, confirmed)
        if ('needsConfirm' in result) {
          setConfirmAdd({ rootPath, warnings: result.needsConfirm })
          return
        }
        setConfirmAdd(undefined)
        if (!result.ok) {
          setError(result.errors.join('\n'))
          return
        }
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const handleAdd = useCallback(async () => {
    setError(undefined)
    // Same native picker the project dialog uses — main owns the dialog, the
    // renderer never sees a path it did not get from main.
    const picked = await window.aecpilot.pickProjectDirectory()
    if (picked) await submitAdd(picked, false)
  }, [submitAdd])

  const handleRemove = useCallback(
    async (source: ProjectSource) => {
      if (!window.confirm(t('sources.removeConfirm'))) return
      setBusy(true)
      setError(undefined)
      try {
        const result = await window.aecpilot.removeSource(source.id)
        if (!result.ok) {
          setError(result.error)
          return
        }
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [refresh, t]
  )

  return (
    <div className="flex flex-col gap-1 border-t border-(--ui-stroke-secondary) p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-(--ui-text-secondary)">{t('sources.title')}</span>
        <Button
          aria-label={t('sources.add')}
          disabled={busy}
          onClick={() => void handleAdd()}
          size="icon-xs"
          title={t('sources.add')}
          variant="ghost"
        >
          <Codicon name="add" />
        </Button>
      </div>

      {error && <div className="whitespace-pre-line text-xs text-destructive">{error}</div>}

      {confirmAdd && (
        <div className="flex flex-col gap-1.5 rounded-[4px] bg-(--ui-bg-quaternary) p-2">
          {confirmAdd.warnings.map((warning) => (
            <span className="text-xs text-(--ui-text-secondary)" key={warning}>
              {warning}
            </span>
          ))}
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => setConfirmAdd(undefined)} variant="text">
              {t('common.cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void submitAdd(confirmAdd.rootPath, true)}>
              {t('sources.addAnyway')}
            </Button>
          </div>
        </div>
      )}

      {sources === undefined ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
      ) : sources.length === 0 ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('sources.empty')}</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {sources.map((source) => {
            const status = statuses?.[source.id]

            return (
              <li key={source.id}>
                <div className="group flex items-center gap-1 rounded-[4px] px-1 hover:bg-(--chrome-action-hover)">
                  <button
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-0.5 text-left"
                    onClick={() => setExpanded((c) => ({ ...c, [source.id]: !c[source.id] }))}
                    title={source.root_path}
                    type="button"
                  >
                    <Codicon
                      className="text-(--ui-text-secondary)"
                      name={expanded[source.id] ? 'chevron-down' : 'chevron-right'}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-(--ui-text-primary)">
                      {source.root_path}
                    </span>
                  </button>
                  {status && status !== 'ok' && (
                    // A source that has gone away is the failure this panel
                    // exists to make visible — a moved drive, a share that is no
                    // longer mounted.
                    <span className="shrink-0 text-xs text-destructive">
                      {t('sources.unavailable')}
                    </span>
                  )}
                  <Button
                    aria-label={t('sources.remove')}
                    className="hidden group-focus-within:flex group-hover:flex"
                    disabled={busy}
                    onClick={() => void handleRemove(source)}
                    size="icon-xs"
                    title={t('sources.remove')}
                    variant="ghost"
                  >
                    <Codicon name="trash" />
                  </Button>
                </div>
                {expanded[source.id] && <SourceTree sourceId={source.id} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
