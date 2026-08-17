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

import { openDocument } from '../viewers/viewer-store'

import { splitBySearchQuery, subtreeMatchesSearchQuery } from './explorer-search-pure'
import { SourcesPanel } from './SourcesPanel'

/** Folders the user has opened. Collapsed is the default: a vault's top level
 * is the map, and expanding everything on load buries it. */
type Expanded = Record<string, boolean>

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onAction,
  busy,
  query
}: {
  node: VaultTreeNode
  depth: number
  expanded: Expanded
  onToggle: (path: string) => void
  onAction: (action: 'newFile' | 'newDir' | 'rename' | 'delete', node: VaultTreeNode) => void
  busy: boolean
  query: string
}) {
  const t = useAecT()
  const isDir = node.type === 'dir'
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
              node={child}
              onAction={onAction}
              onToggle={onToggle}
              query={query}
            />
          ))}
    </>
  )
}

// One key for the tree, so any mutation can invalidate it by name.
const VAULT_TREE_KEY = ['aec', 'vault-tree'] as const

export function VaultExplorer() {
  const t = useAecT()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState<Expanded>({})
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [actionError, setActionError] = useState<string | undefined>(undefined)

  // Server state through React Query, like every screen of theirs — our surface
  // is written in their stack, and main is the server here (PLAN §Слой донора).
  const { data: tree, error: loadError } = useQuery({
    queryKey: VAULT_TREE_KEY,
    queryFn: () => window.aecpilot.getVaultTree()
  })

  const reload = useCallback(
    () => queryClient.invalidateQueries({ queryKey: VAULT_TREE_KEY }),
    [queryClient]
  )

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
    async (action: 'newFile' | 'newDir' | 'rename' | 'delete', node: VaultTreeNode) => {
      setActionError(undefined)

      // window.prompt/confirm are the platform's own modals — deliberate here:
      // the alternative is a dialog per action, and these three questions carry
      // no state worth a component. Replaced when the context menu lands.
      const ask = (message: string, initial = '') => window.prompt(message, initial)?.trim()

      let name: string | undefined
      if (action === 'newFile' || action === 'newDir') {
        name = ask(action === 'newFile' ? t('explorer.newFilePrompt') : t('explorer.newDirPrompt'))
        if (!name) return
      }
      if (action === 'rename') {
        name = ask(t('explorer.renamePrompt'), node.name)
        if (!name || name === node.name) return
      }
      if (action === 'delete' && !window.confirm(t('explorer.deleteConfirm'))) return

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
    [reload, t]
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

        {tree === undefined ? (
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
                node={node}
                onAction={runAction}
                onToggle={toggle}
                query={query}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Sources sit under the vault in the same pane on purpose: they are two
          halves of one question — what the agent may write, and what it may
          only read (SPEC N3). */}
      <SourcesPanel />
    </div>
  )
}
