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
import { useAecT } from '../../shared/i18n'
import type { VaultTreeNode } from '../../../../shared/ipc'

/** Folders the user has opened. Collapsed is the default: a vault's top level
 * is the map, and expanding everything on load buries it. */
type Expanded = Record<string, boolean>

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onAction,
  busy
}: {
  node: VaultTreeNode
  depth: number
  expanded: Expanded
  onToggle: (path: string) => void
  onAction: (action: 'newFile' | 'newDir' | 'rename' | 'delete', node: VaultTreeNode) => void
  busy: boolean
}) {
  const t = useAecT()
  const isDir = node.type === 'dir'
  const isOpen = isDir && expanded[node.path] === true

  return (
    <>
      <li>
        <div
          className="group flex items-center gap-1 rounded-[4px] pr-1 hover:bg-(--chrome-action-hover)"
          style={{ paddingLeft: `${depth * 0.75}rem` }}
        >
          <button
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-0.5 text-left text-xs text-(--ui-text-primary)"
            onClick={() => isDir && onToggle(node.path)}
            title={node.path}
            type="button"
          >
            <Codicon
              className="text-(--ui-text-secondary)"
              name={isDir ? (isOpen ? 'chevron-down' : 'chevron-right') : 'file'}
            />
            <span className="truncate">{node.name}</span>
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
      </li>

      {isOpen &&
        (node.children ?? []).map((child) => (
          <TreeRow
            busy={busy}
            depth={depth + 1}
            expanded={expanded}
            key={child.path}
            node={child}
            onAction={onAction}
            onToggle={onToggle}
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

  return (
    <div className="flex h-full flex-col gap-1 overflow-auto p-2 text-(--ui-text-primary)">
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

      {(actionError ?? loadError) && (
        <div className="text-xs text-destructive">
          {actionError ?? (loadError as Error).message}
        </div>
      )}

      {tree === undefined ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('common.loading')}</div>
      ) : tree.length === 0 ? (
        <div className="text-xs text-(--ui-text-secondary)">{t('explorer.empty')}</div>
      ) : (
        <ul className="flex flex-col">
          {tree.map((node) => (
            <TreeRow
              busy={busy}
              depth={0}
              expanded={expanded}
              key={node.path}
              node={node}
              onAction={runAction}
              onToggle={toggle}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
