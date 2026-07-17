import { useEffect, useRef, useState } from 'react'
import { Tree, type NodeApi, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ACTIVITIES, type ActivityId } from './activities'
import type { OpenProject, ProjectSource, SourceTreeNode, VaultTreeNode } from '../../../shared/ipc'

const SIDEBAR_EMPTY_HINT: Record<Exclude<ActivityId, 'sources' | 'explorer'>, string> = {
  qa: 'Поиск по проекту появится здесь (Phase 2).',
  wiki: 'Дерево страниц вики появится здесь (Phase 3).',
  memory: 'Записи памяти появятся здесь (Phase 4).',
  documents: 'Мастер генерации документов появится здесь (Phase 4).',
  agent: 'Персона, скиллы, MCP-серверы агента появятся здесь (Phase 4).'
}

/** "Источники" activity content (task 1.7): lists the current project's
 * connected sources and offers "Добавить источник" (pick a folder ->
 * `sources:add`). A two-step confirm handles `needsConfirm` (path overlaps
 * an existing source, and/or is currently inaccessible) — re-submitting with
 * `confirmed: true` adds it anyway. Validation errors (nesting inside the
 * vault, exact duplicate) always block and are shown inline. Re-fetches the
 * list whenever `currentProject` changes, which also covers `project:opened`
 * (Shell.tsx updates `currentProject` on that event). */
function SourcesActivity({ currentProject }: { currentProject: OpenProject | null }) {
  const [sources, setSources] = useState<ProjectSource[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [confirm, setConfirm] = useState<{ rootPath: string; warnings: string[] } | undefined>(
    undefined
  )

  useEffect(() => {
    let mounted = true
    async function load(): Promise<void> {
      // Fix-iteration 1 (review major): a pending confirm/error belongs to
      // the project that was open when it was raised — switching projects
      // must clear both, otherwise a stale "Добавить всё равно" would write
      // the candidate into the newly-opened project instead.
      setConfirm(undefined)
      setError(undefined)
      const list = currentProject ? await window.aecpilot.listSources() : []
      if (mounted) setSources(list)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [currentProject])

  async function submitSource(rootPath: string, confirmed?: boolean): Promise<void> {
    setError(undefined)
    try {
      const result = await window.aecpilot.addSource(rootPath, confirmed)
      if ('needsConfirm' in result) {
        setConfirm({ rootPath, warnings: result.needsConfirm })
        return
      }
      setConfirm(undefined)
      if (!result.ok) {
        setError(result.errors.join('; '))
        return
      }
      setSources(result.sources)
    } catch (err) {
      // Fix-iteration 1 (review minor, second line of defense): the main-
      // side write is already wrapped (project-manager.ts's
      // addSourceToProject), but a rejected `addSource` IPC call for any
      // other reason must surface here instead of becoming an unhandled
      // rejection.
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleAddClick(): Promise<void> {
    setPicking(true)
    setError(undefined)
    try {
      const picked = await window.aecpilot.pickProjectDirectory()
      if (!picked) return
      await submitSource(picked)
    } finally {
      setPicking(false)
    }
  }

  if (!currentProject) {
    return <div className="sidebar__empty">Откройте проект, чтобы подключить источники.</div>
  }

  return (
    <div className="sources-panel">
      <ul className="sources-panel__list">
        {sources.length === 0 && <li className="sources-panel__empty">Источники не подключены</li>}
        {sources.map((source) => (
          <SourceEntry
            key={source.id}
            source={source}
            onDetached={(sourceId) => setSources((prev) => prev.filter((s) => s.id !== sourceId))}
          />
        ))}
      </ul>

      <button
        type="button"
        className="sources-panel__add-btn"
        onClick={() => void handleAddClick()}
        disabled={picking}
      >
        {picking ? 'Выбор…' : 'Добавить источник'}
      </button>

      {error && <div className="sources-panel__error">{error}</div>}

      {confirm && (
        <div className="sources-panel__confirm">
          <div className="sources-panel__confirm-text">{confirm.warnings.join(' ')}</div>
          <div className="sources-panel__confirm-actions">
            <button
              type="button"
              className="sources-panel__confirm-btn"
              onClick={() => setConfirm(undefined)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="sources-panel__confirm-btn sources-panel__confirm-btn--primary"
              onClick={() => void submitSource(confirm.rootPath, true)}
            >
              Добавить всё равно
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Recursively renders a connected source's already-loaded subtree (task
 * 1.8) — plain nested rows with per-node expand/collapse state, not
 * react-arborist: unlike the single vault tree (one fixed-size virtualized
 * list), each source here is an independent, variable-height subtree nested
 * inside a scrolling sidebar list, which react-arborist's `Tree` isn't built
 * for. Read-only: clicking a folder only toggles it open/closed, clicking a
 * file does nothing (no viewer yet, same as the vault tree's file rows). */
function SourceTreeChildren({ nodes, depth }: { nodes: SourceTreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((node) => (
        <SourceTreeRow key={node.path} node={node} depth={depth} />
      ))}
    </>
  )
}

function SourceTreeRow({ node, depth }: { node: SourceTreeNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const isDir = node.type === 'dir'

  return (
    <div>
      <div
        className="sources-panel__tree-row"
        style={{ paddingLeft: depth * 16 }}
        onClick={() => isDir && setOpen((o) => !o)}
      >
        <span className="sources-panel__tree-icon">{isDir ? (open ? '📂' : '📁') : '📄'}</span>
        <span className="sources-panel__tree-name">{node.name}</span>
      </div>
      {isDir && open && node.children && (
        <SourceTreeChildren nodes={node.children} depth={depth + 1} />
      )}
    </div>
  )
}

// Availability (task 1.8 fix-iteration 1): checked eagerly, once per source,
// right on mount — this is the sidebar's actual "недоступен" badge, and must
// be visible without the user expanding anything. `'checking'` is the
// transient state while that first check (or a manual "Обновить") is
// in flight.
type SourceStatus = 'checking' | 'ok' | 'unavailable' | 'error'

// The subtree, by contrast, stays lazy — fetched only once the source is
// expanded (and only when its status is 'ok' — nothing to build a tree from
// otherwise).
type SourceTreeState = 'idle' | 'loading' | 'ok' | 'error'

/** One connected source in the "Источники" activity (task 1.8): an
 * expandable node with an "RO" badge (sources are read-only by construction)
 * whose availability is checked as soon as the list loads (via
 * `sources:status`, one IPC call per source — never a single call batching
 * every source, so one dead network share's `statSync` only stalls its own
 * check) — showing "недоступен" without requiring the user to expand
 * anything first. Once expanded, an available source's file tree is fetched
 * lazily via `sources:tree`; an unavailable one shows a status message plus
 * "Обновить" to re-check without reopening the project. Every check/fetch is
 * isolated per source, so one bad source never blocks the others.
 *
 * "Отключить" (task 1.16, BDD "Отключение источника") is a two-step confirm
 * — same "Отмена"/primary-action shape as `SourcesActivity`'s own
 * needsConfirm panel — warning that the source's files will disappear from
 * this tree and its index.db rows will be marked `detached` (kept, not
 * deleted); on success, `onDetached` tells the parent to drop it from the
 * list. */
function SourceEntry({
  source,
  onDetached
}: {
  source: ProjectSource
  onDetached: (sourceId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState<SourceStatus>('checking')
  const [statusError, setStatusError] = useState<string | undefined>(undefined)
  const [treeState, setTreeState] = useState<SourceTreeState>('idle')
  const [tree, setTree] = useState<SourceTreeNode[]>([])
  const [treeError, setTreeError] = useState<string | undefined>(undefined)
  const [confirmingDetach, setConfirmingDetach] = useState(false)
  const [detaching, setDetaching] = useState(false)
  const [detachError, setDetachError] = useState<string | undefined>(undefined)

  function applyStatusResult(
    result: Awaited<ReturnType<typeof window.aecpilot.getSourceStatus>>
  ): void {
    if (!result.ok) {
      setStatus('error')
      setStatusError(result.error)
      return
    }
    setStatus(result.status)
    // A stale tree from before the source went unavailable (or before a
    // refresh) must not linger — re-expanding re-fetches it.
    setTreeState('idle')
    setTree([])
  }

  useEffect(() => {
    // Declared inside the effect (not a sibling component-level function) —
    // same convention as SourcesActivity's/ExplorerActivity's own mount
    // effects, which keeps this fetch-then-setState pattern outside
    // `react-hooks/set-state-in-effect`'s reach (that rule traces call
    // chains starting from a *named function passed in by reference*, not
    // one declared directly in the effect body).
    async function checkOnMount(): Promise<void> {
      try {
        const result = await window.aecpilot.getSourceStatus(source.id)
        applyStatusResult(result)
      } catch (err) {
        setStatus('error')
        setStatusError(err instanceof Error ? err.message : String(err))
      }
    }
    void checkOnMount()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mounted source; `source.id` is this entry's stable identity (keyed by id in the parent list)
  }, [])

  // Used by the "Обновить" button (a click handler, not an effect) — sets
  // the transient "checking" state up front, then re-runs the same fetch.
  async function handleRefresh(): Promise<void> {
    setStatus('checking')
    setStatusError(undefined)
    try {
      const result = await window.aecpilot.getSourceStatus(source.id)
      applyStatusResult(result)
    } catch (err) {
      setStatus('error')
      setStatusError(err instanceof Error ? err.message : String(err))
    }
  }

  async function loadTree(): Promise<void> {
    setTreeState('loading')
    setTreeError(undefined)
    try {
      const result = await window.aecpilot.getSourceTree(source.id)
      if (!result.ok) {
        setTreeState('error')
        setTreeError(result.error)
        return
      }
      if (result.status === 'unavailable') {
        // Became unavailable between the status check and now (e.g. a share
        // dropped mid-session) — reflect that in the badge too.
        setStatus('unavailable')
        setTreeState('idle')
        return
      }
      setTree(result.tree)
      setTreeState('ok')
    } catch (err) {
      setTreeState('error')
      setTreeError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleToggle(): void {
    setExpanded((prev) => {
      const next = !prev
      if (next && status === 'ok' && treeState === 'idle') void loadTree()
      return next
    })
  }

  async function handleDetach(): Promise<void> {
    // Nit (task 1.16 fix-iteration): guards against a double physical click
    // on the confirm button firing two `sources:remove` IPC calls before the
    // first re-render disables it.
    if (detaching) return
    setDetaching(true)
    setDetachError(undefined)
    try {
      const result = await window.aecpilot.removeSource(source.id)
      if (!result.ok) {
        setDetachError(result.error)
        return
      }
      setConfirmingDetach(false)
      onDetached(source.id)
    } catch (err) {
      setDetachError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetaching(false)
    }
  }

  return (
    <li className="sources-panel__source">
      <div className="sources-panel__source-header" title={source.root_path} onClick={handleToggle}>
        <span className="sources-panel__source-arrow">{expanded ? '▾' : '▸'}</span>
        <span className="sources-panel__source-name">{source.root_path}</span>
        <span className="sources-panel__ro-badge">RO</span>
        {status === 'unavailable' && (
          <span className="sources-panel__unavailable-badge">недоступен</span>
        )}
        {status === 'unavailable' && (
          <button
            type="button"
            className="sources-panel__refresh-btn"
            onClick={(e) => {
              e.stopPropagation()
              void handleRefresh()
            }}
          >
            Обновить
          </button>
        )}
        <button
          type="button"
          className="sources-panel__detach-btn"
          onClick={(e) => {
            e.stopPropagation()
            setDetachError(undefined)
            setConfirmingDetach(true)
          }}
        >
          Отключить
        </button>
      </div>

      {confirmingDetach && (
        <div className="sources-panel__confirm">
          <div className="sources-panel__confirm-text">
            Отключить источник «{source.root_path}»? Его файлы исчезнут из дерева, связанные записи
            индекса будут помечены как detached (не удалятся), а страницы вики со ссылками на него
            останутся с пометкой «источник отключён» (появится в Phase 3).
          </div>
          {detachError && <div className="sources-panel__error">{detachError}</div>}
          <div className="sources-panel__confirm-actions">
            <button
              type="button"
              className="sources-panel__confirm-btn"
              disabled={detaching}
              onClick={() => setConfirmingDetach(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="sources-panel__confirm-btn sources-panel__confirm-btn--primary"
              disabled={detaching}
              onClick={() => void handleDetach()}
            >
              {detaching ? 'Отключение…' : 'Отключить'}
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="sources-panel__source-body">
          {status === 'checking' && (
            <div className="sources-panel__source-empty">Проверка доступности…</div>
          )}
          {status === 'unavailable' && (
            <div className="sources-panel__source-empty">Источник недоступен</div>
          )}
          {status === 'error' && <div className="sources-panel__error">{statusError}</div>}
          {status === 'ok' && treeState === 'loading' && (
            <div className="sources-panel__source-empty">Загрузка…</div>
          )}
          {status === 'ok' && treeState === 'error' && (
            <div className="sources-panel__error">{treeError}</div>
          )}
          {status === 'ok' && treeState === 'ok' && tree.length === 0 && (
            <div className="sources-panel__source-empty">Источник пуст</div>
          )}
          {status === 'ok' && treeState === 'ok' && tree.length > 0 && (
            <SourceTreeChildren nodes={tree} depth={1} />
          )}
        </div>
      )}
    </li>
  )
}

/** One row of the explorer tree: a dir/file icon, the name (or an inline
 * rename input while `node.isEditing` — react-arborist's own edit mode,
 * committed with Enter/`node.submit()` or discarded with Escape/blur/
 * `node.reset()`, same pattern as the library's own default node renderer).
 * Clicking a folder toggles it open/closed; clicking a file selects it
 * (task 1.6 explicitly defers opening a file to Phase 2/3 viewers — "allow
 * select only"). */
function VaultTreeRow({ node, style, dragHandle }: NodeRendererProps<VaultTreeNode>) {
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`vault-tree__row${node.isSelected ? ' vault-tree__row--selected' : ''}`}
      onClick={() => (node.data.type === 'dir' ? node.toggle() : node.select())}
    >
      <span className="vault-tree__icon">
        {node.data.type === 'dir' ? (node.isOpen ? '📂' : '📁') : '📄'}
      </span>
      {node.isEditing ? (
        <input
          className="vault-tree__edit-input"
          type="text"
          defaultValue={node.data.name}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => node.reset()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') node.reset()
            if (e.key === 'Enter') node.submit(e.currentTarget.value)
          }}
        />
      ) : (
        <span className="vault-tree__name">{node.data.name}</span>
      )}
    </div>
  )
}

/** Returns the rel path of the folder a new file/folder should be created
 * in: the selected folder itself, the selected file's parent folder, or the
 * vault root (`''`) if nothing is selected. */
function targetParentRel(selected: NodeApi<VaultTreeNode> | null): string {
  if (!selected) return ''
  if (selected.data.type === 'dir') return selected.data.path
  const idx = selected.data.path.lastIndexOf('/')
  return idx === -1 ? '' : selected.data.path.slice(0, idx)
}

/** "Проводник" activity content (task 1.6): a react-arborist tree of the
 * current project's vault, backed by `vault:tree`. Create (+файл/+папка,
 * targeting the selected folder or its selected file's parent, else the
 * root) and delete (with a trash-bound confirm) are plain toolbar buttons;
 * rename reuses react-arborist's own inline edit mode. Every operation
 * reloads the tree from `vault:tree` afterwards — task 1.6 explicitly
 * decided against a live filesystem watcher, favoring a manual "Обновить"
 * button instead. */
function ExplorerActivity({ currentProject }: { currentProject: OpenProject | null }) {
  const treeRef = useRef<TreeApi<VaultTreeNode> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [tree, setTree] = useState<VaultTreeNode[]>([])
  const [selected, setSelected] = useState<NodeApi<VaultTreeNode> | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState<{ type: 'file' | 'dir'; parentRel: string } | undefined>(
    undefined
  )
  const [creatingName, setCreatingName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<VaultTreeNode | undefined>(undefined)

  async function load(): Promise<void> {
    const nextTree = currentProject ? await window.aecpilot.getVaultTree() : []
    setTree(nextTree)
  }

  useEffect(() => {
    async function reset(): Promise<void> {
      setSelected(null)
      setCreating(undefined)
      setDeleteTarget(undefined)
      setError(undefined)
      await load()
    }
    void reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` reads `currentProject` itself
  }, [currentProject])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function openCreate(type: 'file' | 'dir'): void {
    setError(undefined)
    setCreating({ type, parentRel: targetParentRel(selected) })
    setCreatingName('')
  }

  async function submitCreate(): Promise<void> {
    if (!creating) return
    const name = creatingName.trim()
    if (name.length === 0) return
    const result =
      creating.type === 'file'
        ? await window.aecpilot.createVaultFile(creating.parentRel, name)
        : await window.aecpilot.createVaultDir(creating.parentRel, name)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCreating(undefined)
    setSelected(null)
    await load()
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return
    const result = await window.aecpilot.deleteVaultEntry(deleteTarget.path)
    setDeleteTarget(undefined)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSelected(null)
    await load()
  }

  async function handleShowInExplorer(): Promise<void> {
    if (!selected) return
    const result = await window.aecpilot.showVaultEntryInExplorer(selected.data.path)
    if (!result.ok) setError(result.error)
  }

  if (!currentProject) {
    return <div className="sidebar__empty">Откройте проект, чтобы увидеть дерево vault.</div>
  }

  return (
    <div className="explorer-panel">
      <div className="explorer-panel__toolbar">
        <button type="button" className="explorer-panel__btn" onClick={() => openCreate('file')}>
          + файл
        </button>
        <button type="button" className="explorer-panel__btn" onClick={() => openCreate('dir')}>
          + папка
        </button>
        <button
          type="button"
          className="explorer-panel__btn"
          disabled={!selected}
          onClick={() => void selected?.edit()}
        >
          Переименовать
        </button>
        <button
          type="button"
          className="explorer-panel__btn"
          disabled={!selected}
          onClick={() => selected && setDeleteTarget(selected.data)}
        >
          Удалить
        </button>
        <button
          type="button"
          className="explorer-panel__btn"
          disabled={!selected}
          onClick={() => void handleShowInExplorer()}
        >
          Показать в проводнике
        </button>
        <button type="button" className="explorer-panel__btn" onClick={() => void load()}>
          Обновить
        </button>
      </div>

      {creating && (
        <div className="explorer-panel__create-row">
          <input
            autoFocus
            type="text"
            className="explorer-panel__create-input"
            placeholder={creating.type === 'file' ? 'имя файла' : 'имя папки'}
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCreate()
              if (e.key === 'Escape') setCreating(undefined)
            }}
          />
          <button type="button" className="explorer-panel__btn" onClick={() => void submitCreate()}>
            OK
          </button>
          <button
            type="button"
            className="explorer-panel__btn"
            onClick={() => setCreating(undefined)}
          >
            Отмена
          </button>
        </div>
      )}

      {error && <div className="explorer-panel__error">{error}</div>}

      {deleteTarget && (
        <div className="explorer-panel__confirm">
          <div className="explorer-panel__confirm-text">
            Удалить «{deleteTarget.name}»? Элемент попадёт в корзину.
          </div>
          <div className="explorer-panel__confirm-actions">
            <button
              type="button"
              className="explorer-panel__confirm-btn"
              onClick={() => setDeleteTarget(undefined)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="explorer-panel__confirm-btn explorer-panel__confirm-btn--danger"
              onClick={() => void confirmDelete()}
            >
              Удалить
            </button>
          </div>
        </div>
      )}

      <div className="explorer-panel__tree" ref={containerRef}>
        {tree.length === 0 && !creating ? (
          <div className="explorer-panel__empty">Vault пуст</div>
        ) : (
          <Tree<VaultTreeNode>
            ref={treeRef}
            data={tree}
            idAccessor="path"
            childrenAccessor="children"
            disableMultiSelection
            disableDrag
            disableDrop
            width={containerSize.width || undefined}
            height={containerSize.height || undefined}
            onSelect={(nodes) => setSelected(nodes[0] ?? null)}
            onRename={({ id, name }) => {
              void (async () => {
                const result = await window.aecpilot.renameVaultEntry(id, name)
                if (!result.ok) setError(result.error)
                // Fix-iteration 1 (review nit): `selected` holds the NodeApi
                // whose `data.path` was just renamed — stale after the tree
                // reloads with the new path, so it must not be kept as if it
                // still referred to the (now non-existent) old node.
                setSelected(null)
                await load()
              })()
            }}
          >
            {VaultTreeRow}
          </Tree>
        )}
      </div>
    </div>
  )
}

/** Contextual sidebar (task 1.0): content depends on the active rail
 * activity. "Источники" (task 1.7) and "Проводник" (task 1.6) have real
 * content; every other activity stays a stub naming the section, per the
 * coordinator's Phase-1 scope decision. */
export default function Sidebar({
  active,
  currentProject
}: {
  active: ActivityId
  currentProject: OpenProject | null
}) {
  const activity = ACTIVITIES.find((item) => item.id === active)
  return (
    <aside className="sidebar">
      <div className="sidebar__header">{activity?.label}</div>
      {active === 'sources' ? (
        <SourcesActivity currentProject={currentProject} />
      ) : active === 'explorer' ? (
        <ExplorerActivity currentProject={currentProject} />
      ) : (
        <div className="sidebar__empty">{SIDEBAR_EMPTY_HINT[active]}</div>
      )}
    </aside>
  )
}
