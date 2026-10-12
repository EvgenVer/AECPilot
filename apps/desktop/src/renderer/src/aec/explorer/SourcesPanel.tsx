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
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '../../donor/components/ui/context-menu'
import { notify } from '../../donor/store/notifications'
import { useAecT } from '../../shared/i18n'
import type { InventoryFile, ProjectSource, SourceTreeNode } from '../../../../shared/ipc'
import { sourceDisplayName } from '../../../../shared/source-name'

import {
  type DocumentAction,
  type DocumentIndex,
  documentActions,
  runDocumentAction,
  useDocumentIndex
} from '../index-status/document-actions'
import { openDocument } from '../viewers/viewer-store'
import { openIndexPage } from '../workspace-pages'

import { GraphAddDialog } from './GraphAddDialog'
import { askGraphAdd, indexTarget } from './graph-add-store'
import { useConfirm } from './useConfirm'

const SOURCES_KEY = ['aec', 'sources'] as const

/** Reachability per source id, filled in after the list arrives. */
type Statuses = Record<string, 'ok' | 'unavailable' | 'error'>

/** Задача 3L.6: действие по файлу источника из его меню. */
type FileAct = (action: DocumentAction, sourceId: string, rel: string) => Promise<void>

/** Значки состояния файла источника — из той же описи, что на странице
 *  «Индекс» (задача 3L.6, SPEC UR46). */
function FileMarks({ excluded, file }: { excluded: boolean; file: InventoryFile | null }) {
  const t = useAecT()
  const marks: { className?: string; icon: string; label: string }[] = []
  if (excluded) marks.push({ icon: 'circle-slash', label: t('index.document.excluded') })
  else if (file?.index === 'indexed') marks.push({ icon: 'database', label: t('explorer.inIndex') })
  else if (file?.index === 'partial' && file.scans) {
    marks.push({
      className: 'text-amber-500',
      icon: 'database',
      label: t('index.document.partial', file.scans.done, file.scans.total)
    })
  }
  if (!excluded && file?.graph === 'in') {
    marks.push({ icon: 'type-hierarchy', label: t('index.inventory.graph.in') })
  }
  return (
    <>
      {marks.map((mark) => (
        <span
          aria-label={mark.label}
          className={`flex shrink-0 ${mark.className ?? 'text-(--ui-text-secondary)'}`}
          key={mark.label}
          role="img"
          title={mark.label}
        >
          <Codicon name={mark.icon} />
        </span>
      ))}
    </>
  )
}

/** One source's files, read only when the user opens it — a source can be a
 * network share with tens of thousands of entries, and nothing about the panel
 * needs them until someone looks. */
function SourceTree({
  act,
  index,
  sourceId
}: {
  act: FileAct
  index: DocumentIndex
  sourceId: string
}) {
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

  return <SourceNodes act={act} depth={1} index={index} nodes={data.tree} sourceId={sourceId} />
}

function SourceNodes({
  act,
  index,
  nodes,
  depth,
  sourceId
}: {
  act: FileAct
  index: DocumentIndex
  nodes: SourceTreeNode[]
  depth: number
  sourceId: string
}) {
  const t = useAecT()
  const [open, setOpen] = useState<Record<string, boolean>>({})

  return (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        const file = node.type === 'dir' ? null : index.file(sourceId, node.path)
        const excluded = node.type !== 'dir' && index.excluded(sourceId, node.path)
        return (
          <li key={node.path}>
            <ContextMenu>
              <ContextMenuTrigger asChild>
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
                  {node.type === 'dir' ? null : <FileMarks excluded={excluded} file={file} />}
                  <Button
                    aria-label={t('explorer.reveal')}
                    className="hidden group-focus-within:flex group-hover:flex"
                    onClick={() =>
                      void window.aecpilot.showSourceEntryInExplorer(sourceId, node.path)
                    }
                    size="icon-xs"
                    title={t('explorer.reveal')}
                    variant="ghost"
                  >
                    <Codicon name="folder-opened" />
                  </Button>
                </div>
              </ContextMenuTrigger>
              {/* Единица выбора UR24 — папка либо файл, и вид здесь берётся из
                дерева, а не из догадки по расширению. */}
              <ContextMenuContent>
                {/* Задача 3L.6: у файла — действия по его состоянию в описи; папка
                  индексируется целиком, как раньше. */}
                {node.type === 'dir' ? (
                  <ContextMenuItem
                    onSelect={() =>
                      void indexTarget({
                        kind: 'folder',
                        label: `${sourceId}/${node.path}`,
                        rel: node.path,
                        sourceId
                      })
                    }
                  >
                    {t('index.menu')}
                  </ContextMenuItem>
                ) : (
                  documentActions(file, excluded).map((action) => (
                    <ContextMenuItem
                      key={action}
                      onSelect={() => void act(action, sourceId, node.path)}
                    >
                      {t(`index.document.${action}`)}
                    </ContextMenuItem>
                  ))
                )}
                <ContextMenuItem
                  onSelect={() =>
                    askGraphAdd({
                      kind: node.type === 'dir' ? 'folder' : 'file',
                      label: `${sourceId}/${node.path}`,
                      rel: node.path,
                      sourceId
                    })
                  }
                >
                  {t('graphAdd.menu')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {node.type === 'dir' && open[node.path] && (
              <SourceNodes
                act={act}
                depth={depth + 1}
                index={index}
                nodes={node.children ?? []}
                sourceId={sourceId}
              />
            )}
          </li>
        )
      })}
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
  // 3J.6: источник, чьё название правится прямо в строке, и черновик названия.
  const [renaming, setRenaming] = useState<{ id: string; value: string } | undefined>(undefined)
  // Меню при закрытии возвращает фокус на строку, и поле названия теряло его
  // сразу же. Фокус ставится полю после закрытия меню; потеря фокуса сохраняет
  // только изменённое название — пустым его не перезапишет.
  const renameInput = useRef<HTMLInputElement | null>(null)
  const renamingId = renaming?.id
  useEffect(() => {
    if (!renamingId) return
    const timer = window.setTimeout(() => renameInput.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [renamingId])

  // Задача 3.13b. Наши расширения запускает само ядро — значит при удалённом
  // ядре они живут там же и читают ту машину. Здешний список к его работе
  // отношения не имеет, и показывать «источников нет» было бы неправдой о
  // другом вопросе. Полный ответ — серверная поставка (PLAN, фаза 6).
  const { data: connection, isError: connectionUnknown } = useQuery({
    queryKey: ['aec', 'connection'],
    queryFn: () => window.aecpilot.getConnection()
  })
  const filesAreRemote = connection !== undefined && connection.mode !== 'local'

  const { data: sources } = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: () => window.aecpilot.listSources(),
    enabled: connectionUnknown || connection?.mode === 'local'
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

  // D-204: своё окно подтверждения, не `window.confirm` (см. useConfirm).
  const { confirm, dialog: confirmDialog } = useConfirm()

  // Задача 3L.6: опись и список убранного — для значков и меню файлов.
  const documentIndex = useDocumentIndex(connectionUnknown || connection?.mode === 'local')
  const actOnFile = useCallback<FileAct>(
    async (action, sourceId, rel) => {
      if (
        action === 'exclude' &&
        !(await confirm(t('index.document.excludeConfirm'), t('index.document.exclude')))
      )
        return
      const failed = await runDocumentAction(action, { kind: 'file', rel, sourceId })
      if (failed) {
        notify({ kind: 'error', title: t('index.document.failedTitle'), message: failed })
        return
      }
      if (action === 'exclude') await documentIndex.refresh()
      else openIndexPage()
    },
    [confirm, documentIndex, t]
  )

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
      if (!(await confirm(t('sources.removeConfirm'), t('sources.remove')))) return
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
    [confirm, refresh, t]
  )

  // 3J.6 (SPEC UR44): название — только в project.json, папка на диске та же.
  const commitRename = useCallback(async () => {
    const draft = renaming
    setRenaming(undefined)
    if (!draft) return
    setError(undefined)
    try {
      const result = await window.aecpilot.renameSource(draft.id, draft.value)
      if (!result.ok) {
        setError(result.error)
        return
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [refresh, renaming])

  const openSourceFolder = useCallback(async (source: ProjectSource) => {
    const result = await window.aecpilot.showSourceEntryInExplorer(source.id, '')
    if (!result.ok) setError(result.error)
  }, [])

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

      {filesAreRemote ? (
        <div className="flex flex-col gap-1 rounded-[4px] bg-(--ui-bg-quaternary) p-2 text-xs">
          <strong className="text-(--ui-text-primary)">{t('sources.remoteTitle')}</strong>
          <p className="text-(--ui-text-secondary)">{t('sources.remoteDetail')}</p>
        </div>
      ) : sources === undefined ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
      ) : sources.length === 0 ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('sources.empty')}</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {sources.map((source) => {
            const status = statuses?.[source.id]

            return (
              <li key={source.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
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
                        {renaming?.id === source.id ? null : (
                          <span className="min-w-0 flex-1 truncate text-xs text-(--ui-text-primary)">
                            {sourceDisplayName(source)}
                          </span>
                        )}
                      </button>
                      {renaming?.id === source.id && (
                        <input
                          aria-label={t('sources.renameLabel')}
                          className="min-w-0 flex-1 rounded-[4px] border border-(--ui-border) bg-transparent px-1 text-xs text-(--ui-text-primary)"
                          onBlur={() => {
                            if (renaming.value.trim() !== (source.label ?? '')) void commitRename()
                          }}
                          onChange={(event) =>
                            setRenaming({ id: source.id, value: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void commitRename()
                            if (event.key === 'Escape') setRenaming(undefined)
                          }}
                          placeholder={sourceDisplayName({ root_path: source.root_path })}
                          ref={renameInput}
                          title={t('sources.renameLabel')}
                          value={renaming.value}
                        />
                      )}
                      {status && status !== 'ok' && (
                        // A source that has gone away is the failure this panel
                        // exists to make visible — a moved drive, a share that is no
                        // longer mounted.
                        <span className="shrink-0 text-xs text-destructive">
                          {t('sources.unavailable')}
                        </span>
                      )}
                      <Button
                        aria-label={t('sources.openInExplorer')}
                        className="hidden group-focus-within:flex group-hover:flex"
                        onClick={() => void openSourceFolder(source)}
                        size="icon-xs"
                        title={t('sources.openInExplorer')}
                        variant="ghost"
                      >
                        <Codicon name="folder-opened" />
                      </Button>
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
                  </ContextMenuTrigger>
                  {/* Корень источника — тоже единица выбора (UR24), и для него
                      путь области это один идентификатор источника. */}
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => setRenaming({ id: source.id, value: source.label ?? '' })}
                    >
                      {t('sources.rename')}
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void openSourceFolder(source)}>
                      {t('sources.openInExplorer')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() =>
                        void indexTarget({
                          kind: 'folder',
                          label: sourceDisplayName(source),
                          rel: '',
                          sourceId: source.id
                        })
                      }
                    >
                      {t('index.menu')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() =>
                        askGraphAdd({
                          kind: 'folder',
                          label: sourceDisplayName(source),
                          rel: '',
                          sourceId: source.id
                        })
                      }
                    >
                      {t('graphAdd.menu')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
                {expanded[source.id] && (
                  <SourceTree act={actOnFile} index={documentIndex} sourceId={source.id} />
                )}
              </li>
            )
          })}
        </ul>
      )}

      <GraphAddDialog />
      {confirmDialog}
    </div>
  )
}
