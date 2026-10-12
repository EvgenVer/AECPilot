// The vault explorer — ours, because the donor has no such thing: their file
// pane browses a working directory, ours browses the project's vault, which is
// a structure we create and own (specs/workspace-sources.md).
//
// Task 1.8.17, first slice: the tree itself plus create/rename/delete. Sources,
// search and "show in Explorer" are the slices after it.
//
// The tree comes from main already assembled — `.aecpilot` hidden, symlinks
// shown as leaves and never traversed — so this component never touches the
// file system, only the IPC bridge.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '../../donor/components/ui/context-menu'
import { useAecT } from '../../shared/i18n'
import type { VaultTreeNode } from '../../../../shared/ipc'
import { PROJECT_SOURCE_ID } from '../../../../shared/source-name'

import { runDocumentAction, useDocumentIndex, waitingScans } from '../index-status/document-actions'
import { openDocument } from '../viewers/viewer-store'
import { openIndexPage } from '../workspace-pages'

import { splitBySearchQuery, subtreeMatchesSearchQuery } from './explorer-search-pure'
import { askGraphAdd } from './graph-add-store'
import { NamePrompt } from './NamePrompt'
import { useConfirm } from './useConfirm'
import { indexMark } from './project-index-pure'
import { SourcesPanel } from './SourcesPanel'

/** Folders the user has opened. Collapsed is the default: a vault's top level
 * is the map, and expanding everything on load buries it. */
type Expanded = Record<string, boolean>

type RowAction =
  'newFile' | 'newDir' | 'rename' | 'delete' | 'include' | 'exclude' | 'continueScans'

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onAction,
  busy,
  marked,
  scansWaiting,
  query
}: {
  node: VaultTreeNode
  depth: number
  expanded: Expanded
  onToggle: (path: string) => void
  onAction: (action: RowAction, node: VaultTreeNode) => void
  busy: boolean
  /** Task 3K.5: project files marked for the index (SPEC UR45). */
  marked: ReadonlySet<string>
  /** Task 3L.6: a marked file whose scanned pages still wait for recognition. */
  scansWaiting: (path: string) => boolean
  query: string
}) {
  const t = useAecT()
  const isDir = node.type === 'dir'
  const mark = indexMark(node, marked)
  // While filtering, a folder is open whether or not the user opened it —
  // otherwise the match is behind a closed door.
  const isOpen = isDir && (query.trim() !== '' || expanded[node.path] === true)
  const { pre, match, post } = splitBySearchQuery(node.name, query)

  return (
    <>
      <li>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className="group flex items-center gap-1 rounded-[4px] pr-1 outline-none hover:bg-(--chrome-action-hover) focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
              onKeyDown={(event) => {
                // Del on the focused row, the way a file manager behaves. The
                // confirm still runs — this is a shortcut, not a bypass.
                if (event.key === 'Delete' && !busy) {
                  event.preventDefault()
                  onAction('delete', node)
                }
              }}
              style={{ paddingLeft: `${depth * 0.75}rem` }}
              tabIndex={0}
            >
              <button
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-0.5 text-left text-xs text-(--ui-text-primary)"
                // Задача 4.2a: клик по файлу открывает его в просмотрщике.
                // До этого документ можно было открыть только из цитаты, то
                // есть только тот, который агент случайно упомянул.
                onClick={() =>
                  isDir ? onToggle(node.path) : openDocument({ locator: {}, relPath: node.path })
                }
                title={node.path}
                type="button"
              >
                <Codicon
                  className="text-(--ui-text-secondary)"
                  name={isDir ? (isOpen ? 'chevron-down' : 'chevron-right') : 'file'}
                />
                <span className="truncate">
                  {pre}
                  {match && (
                    <mark className="bg-transparent font-semibold text-primary">{match}</mark>
                  )}
                  {post}
                </span>
                {!isDir && mark === 'all' && (
                  <span
                    aria-label={t('explorer.inIndex')}
                    className="shrink-0 text-(--ui-text-secondary)"
                    role="img"
                    title={t('explorer.inIndex')}
                  >
                    <Codicon name="database" />
                  </span>
                )}
              </button>

              {/* Row actions stay hidden until the row is hovered or focused —
              a tree of twenty rows with four buttons each is unreadable. */}
              <span className="hidden gap-0.5 group-focus-within:flex group-hover:flex">
                {isDir && (
                  <>
                    <Button
                      aria-label={t('explorer.newFile')}
                      disabled={busy}
                      onClick={() => onAction('newFile', node)}
                      size="icon-xs"
                      title={t('explorer.newFile')}
                      variant="ghost"
                    >
                      <Codicon name="new-file" />
                    </Button>
                    <Button
                      aria-label={t('explorer.newDir')}
                      disabled={busy}
                      onClick={() => onAction('newDir', node)}
                      size="icon-xs"
                      title={t('explorer.newDir')}
                      variant="ghost"
                    >
                      <Codicon name="new-folder" />
                    </Button>
                  </>
                )}
                <Button
                  aria-label={t('explorer.rename')}
                  disabled={busy}
                  onClick={() => onAction('rename', node)}
                  size="icon-xs"
                  title={t('explorer.rename')}
                  variant="ghost"
                >
                  <Codicon name="edit" />
                </Button>
                <Button
                  aria-label={t('explorer.reveal')}
                  onClick={() => void window.aecpilot.showVaultEntryInExplorer(node.path)}
                  size="icon-xs"
                  title={t('explorer.reveal')}
                  variant="ghost"
                >
                  <Codicon name="folder-opened" />
                </Button>
                <Button
                  aria-label={t('explorer.delete')}
                  disabled={busy}
                  onClick={() => onAction('delete', node)}
                  size="icon-xs"
                  title={t('explorer.delete')}
                  variant="ghost"
                >
                  <Codicon name="trash" />
                </Button>
              </span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {isDir && (
              <>
                <ContextMenuItem onSelect={() => onAction('newFile', node)}>
                  {t('explorer.newFile')}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onAction('newDir', node)}>
                  {t('explorer.newDir')}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onSelect={() => onAction('rename', node)}>
              {t('explorer.rename')}
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => void window.aecpilot.showVaultEntryInExplorer(node.path)}
            >
              {t('explorer.reveal')}
            </ContextMenuItem>
            {/* Task 3K.5 (SPEC UR45): nothing of the project is indexed unless
                a person picks it here. The graph is built over indexed text
                only, so it is offered where something is marked. */}
            <ContextMenuSeparator />
            {mark !== 'all' && (
              <ContextMenuItem onSelect={() => onAction('include', node)}>
                {t('explorer.includeInIndex')}
              </ContextMenuItem>
            )}
            {!isDir && scansWaiting(node.path) && (
              <ContextMenuItem onSelect={() => onAction('continueScans', node)}>
                {t('index.document.continueScans')}
              </ContextMenuItem>
            )}
            {mark !== 'none' && (
              <>
                <ContextMenuItem onSelect={() => onAction('exclude', node)}>
                  {t('explorer.excludeFromIndex')}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() =>
                    askGraphAdd({
                      kind: isDir ? 'folder' : 'file',
                      label: node.path,
                      rel: node.path,
                      sourceId: PROJECT_SOURCE_ID
                    })
                  }
                >
                  {t('graphAdd.menu')}
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onAction('delete', node)} variant="destructive">
              {t('explorer.delete')}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </li>

      {isOpen &&
        (node.children ?? [])
          .filter((child) => subtreeMatchesSearchQuery(child, query))
          .map((child) => (
            <TreeRow
              busy={busy}
              depth={depth + 1}
              expanded={expanded}
              key={child.path}
              marked={marked}
              node={child}
              onAction={onAction}
              onToggle={onToggle}
              query={query}
              scansWaiting={scansWaiting}
            />
          ))}
    </>
  )
}

// One key for the tree, so any mutation can invalidate it by name.
const VAULT_TREE_KEY = ['aec', 'vault-tree'] as const
const PROJECT_INDEX_KEY = ['aec', 'project-index'] as const
const NO_MARKS: ReadonlySet<string> = new Set()

export function VaultExplorer() {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Expanded>({})
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const { confirm, dialog: confirmDialog } = useConfirm()
  // Открытый вопрос «как назвать?» и тот, кто ждёт ответа. Обещание, а не
  // колбэк в состоянии действия: `runAction` тогда читается как прежний
  // линейный сценарий — спросил, получил, сделал.
  const [namePrompt, setNamePrompt] = useState<{
    message: string
    initial: string
    resolve: (name: string | null) => void
  } | null>(null)

  // Задача 3.13b. Хранилище проекта — понятие ЭТОЙ машины: путь, который человек
  // выбрал в местном диалоге. Когда ядро работает на другой машине, агент правит
  // файлы ТАМ, и это дерево показывало бы чужие — свои собственные, местные, —
  // выглядя при этом исправным. Поэтому оно молчит и говорит, куда смотреть: их
  // дерево проекта уже читает машину ядра.
  const { data: connection, isError: connectionUnknown } = useQuery({
    queryKey: ['aec', 'connection'],
    queryFn: () => window.aecpilot.getConnection()
  })
  const filesAreRemote = connection !== undefined && connection.mode !== 'local'

  // Server state through React Query, like every screen of theirs — our surface
  // is written in their stack, and main is the server here (PLAN §Слой донора).
  const { data: tree, error: loadError } = useQuery({
    queryKey: VAULT_TREE_KEY,
    queryFn: () => window.aecpilot.getVaultTree(),
    // Ждём ответа о подключении, а не считаем «локально» по умолчанию: иначе при
    // удалённом ядре местное дерево успело бы мелькнуть на экране — то самое
    // «показывает чужие файлы», ради которого всё и делается. Если спросить не
    // удалось, дерево показываем: сломанный мост — отдельная беда, и молчащий
    // проводник её не лечит.
    enabled: connectionUnknown || connection?.mode === 'local'
  })

  const { data: projectIndex } = useQuery({
    queryKey: PROJECT_INDEX_KEY,
    queryFn: () => window.aecpilot.listProjectIndex(),
    enabled: connectionUnknown || connection?.mode === 'local'
  })
  const marked = projectIndex ? new Set(projectIndex) : NO_MARKS
  // Task 3L.6: the same inventory as the Index page — which marked file still
  // has scanned pages waiting.
  const documentIndex = useDocumentIndex(connectionUnknown || connection?.mode === 'local')
  const scansWaiting = useCallback(
    (path: string): boolean => {
      const file = documentIndex.file(PROJECT_SOURCE_ID, path)
      return file !== null && waitingScans(file) > 0
    },
    [documentIndex]
  )

  const reload = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: VAULT_TREE_KEY })
    await queryClient.invalidateQueries({ queryKey: PROJECT_INDEX_KEY })
  }, [queryClient])

  useEffect(() => {
    // A project switch replaces the whole tree, so the open/closed state of the
    // old one is meaningless.
    return window.aecpilot.onProjectOpened(() => {
      setExpanded({})
      void reload()
    })
  }, [reload])

  const toggle = useCallback((path: string) => {
    setExpanded((current) => ({ ...current, [path]: !current[path] }))
  }, [])

  const runAction = useCallback(
    async (action: RowAction, node: VaultTreeNode) => {
      setActionError(undefined)

      // Task 3L.6: the run on this file finishes its scanned pages.
      if (action === 'continueScans') {
        const failed = await runDocumentAction('continueScans', {
          kind: 'file',
          rel: node.path,
          sourceId: PROJECT_SOURCE_ID
        })
        if (failed) setActionError(failed)
        else openIndexPage()
        return
      }

      // Task 3K.5: «Включить в индекс» marks and indexes at once, and the Index
      // page shows the run — the same as «Проиндексировать» on a source.
      if (action === 'include' || action === 'exclude') {
        if (
          action === 'exclude' &&
          !(await confirm(t('explorer.excludeConfirm'), t('explorer.excludeFromIndex')))
        )
          return
        const target = { kind: node.type === 'dir' ? 'folder' : 'file', rel: node.path } as const
        setBusy(true)
        try {
          const result =
            action === 'include'
              ? await window.aecpilot.includeInIndex(target)
              : await window.aecpilot.excludeFromIndex(target)
          if (!result.ok) {
            setActionError(result.error)
            return
          }
          queryClient.setQueryData(PROJECT_INDEX_KEY, result.files)
          if (action === 'include') openIndexPage()
        } catch (err) {
          setActionError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
        return
      }

      // Имя спрашивает своё окно (`NamePrompt`): `window.prompt` в Electron не
      // реализован и бросает исключение — дефект D-90, до него ни создание, ни
      // переименование из проводника не работали. Подтверждение — тоже своим
      // окном (`useConfirm`, D-204): после системного поля окна теряют фокус.
      const ask = (message: string, initial = ''): Promise<string | undefined> =>
        new Promise((resolve) =>
          setNamePrompt({
            message,
            initial,
            resolve: (answer) => {
              setNamePrompt(null)
              resolve(answer?.trim())
            }
          })
        )

      let name: string | undefined
      if (action === 'newFile' || action === 'newDir') {
        name = await ask(
          action === 'newFile' ? t('explorer.newFilePrompt') : t('explorer.newDirPrompt')
        )
        if (!name) return
      }
      if (action === 'rename') {
        name = await ask(t('explorer.renamePrompt'), node.name)
        if (!name || name === node.name) return
      }
      if (
        action === 'delete' &&
        !(await confirm(t('explorer.deleteConfirm'), t('explorer.delete')))
      )
        return

      setBusy(true)
      try {
        const parentRel = node.type === 'dir' ? node.path : undefined
        const result =
          action === 'newFile'
            ? await window.aecpilot.createVaultFile(parentRel, name as string)
            : action === 'newDir'
              ? await window.aecpilot.createVaultDir(parentRel, name as string)
              : action === 'rename'
                ? await window.aecpilot.renameVaultEntry(node.path, name as string)
                : await window.aecpilot.deleteVaultEntry(node.path)

        if (!result.ok) {
          setActionError(result.error)
          return
        }
        if (action === 'newFile' || action === 'newDir') {
          setExpanded((current) => ({ ...current, [node.path]: true }))
        }
        await reload()
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [confirm, queryClient, reload, t]
  )

  // Filtering keeps a folder that only CONTAINS a match, so the path down to
  // it stays walkable (explorer-search-pure).
  const visible = (tree ?? []).filter((node) => subtreeMatchesSearchQuery(node, query))

  return (
    <div className="flex h-full flex-col overflow-auto text-(--ui-text-primary)">
      <div className="flex flex-col gap-1 p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-(--ui-text-secondary)">
            {t('explorer.title')}
          </span>
          <span className="flex gap-0.5">
            <Button
              aria-label={t('explorer.newFile')}
              disabled={busy}
              onClick={() =>
                void runAction('newFile', { name: '', path: '', type: 'dir', children: [] })
              }
              size="icon-xs"
              title={t('explorer.newFile')}
              variant="ghost"
            >
              <Codicon name="new-file" />
            </Button>
            <Button
              aria-label={t('common.refresh')}
              disabled={busy}
              onClick={() => void reload()}
              size="icon-xs"
              title={t('common.refresh')}
              variant="ghost"
            >
              <Codicon name="refresh" />
            </Button>
          </span>
        </div>

        <input
          aria-label={t('explorer.search')}
          className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1 text-xs text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('explorer.search')}
          type="search"
          value={query}
        />

        {(actionError ?? loadError) && (
          <div className="text-xs text-destructive">
            {actionError ?? (loadError as Error).message}
          </div>
        )}

        {filesAreRemote ? (
          <div className="flex flex-col gap-1 rounded-[4px] bg-(--ui-bg-quaternary) p-2 text-xs">
            <strong className="text-(--ui-text-primary)">{t('explorer.remoteTitle')}</strong>
            <p className="text-(--ui-text-secondary)">{t('explorer.remoteDetail')}</p>
          </div>
        ) : tree === undefined ? (
          <div className="text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
        ) : tree.length === 0 ? (
          <div className="text-xs text-(--ui-text-secondary)">{t('explorer.empty')}</div>
        ) : visible.length === 0 ? (
          <div className="text-xs text-(--ui-text-secondary)">{t('explorer.noMatches')}</div>
        ) : (
          <ul className="flex flex-col">
            {visible.map((node) => (
              <TreeRow
                busy={busy}
                depth={0}
                expanded={expanded}
                key={node.path}
                marked={marked}
                node={node}
                onAction={runAction}
                onToggle={toggle}
                query={query}
                scansWaiting={scansWaiting}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Sources sit under the vault in the same pane on purpose: they are two
          halves of one question — what the agent may write, and what it may
          only read (SPEC N3). */}
      <SourcesPanel />

      {namePrompt && (
        <NamePrompt
          initial={namePrompt.initial}
          message={namePrompt.message}
          onAnswer={namePrompt.resolve}
        />
      )}
      {confirmDialog}
    </div>
  )
}
