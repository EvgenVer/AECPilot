import { useEffect, useRef, useState } from 'react'
import { Tree, type NodeApi, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ACTIVITIES, type ActivityId } from './activities'
import { FolderOpenIcon, PowerIcon, ScanIcon, SourcesIcon } from './icons'
import { mergeScanStatuses, type SourceStatus } from './source-status-pure'
import type { OpenProject, ProjectSource, SourceTreeNode, VaultTreeNode } from '../../../shared/ipc'

const SIDEBAR_EMPTY_HINT: Record<Exclude<ActivityId, 'sources' | 'explorer'>, string> = {
  qa: 'Поиск по проекту появится здесь (Phase 2).',
  wiki: 'Дерево страниц вики появится здесь (Phase 3).',
  memory: 'Записи памяти появятся здесь (Phase 4).',
  documents: 'Мастер генерации документов появится здесь (Phase 4).',
  agent: 'Персона, скиллы, MCP-серверы агента появятся здесь (Phase 4).'
}

const STATUS_PILL: Record<SourceStatus, { label: string; modifier: string }> = {
  checking: { label: 'проверка…', modifier: 'checking' },
  ok: { label: 'подключён', modifier: 'ok' },
  unavailable: { label: 'недоступен', modifier: 'unavailable' },
  error: { label: 'ошибка', modifier: 'unavailable' }
}

/** A short, human-friendly label for a source's root path: its last path
 * segment (`\\server\share\Проекты 2024\Мост` -> `Мост`), falling back to
 * the full path for a root with no usable last segment (e.g. a bare drive
 * letter `C:\`). `ProjectSource` has no separate display-name field (out of
 * scope — no schema change here), so this is derived purely in the
 * renderer; the full path is always still shown/available via `title`. */
function displaySourceName(rootPath: string): string {
  const trimmed = rootPath.replace(/[/\\]+$/, '')
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const tail = idx === -1 ? trimmed : trimmed.slice(idx + 1)
  return tail.length > 0 ? tail : trimmed
}

/** Tracks every connected source's availability `status`, shared by the
 * "Источники" manager cards and the "Проводник" tree's source rows (task
 * 1.5.5). Two ways a badge updates:
 * - once per source right when `sources` loads/changes (`sources:status`,
 *   one IPC call per source — never a single batched call, so one dead
 *   network share's `statSync` only stalls its own check);
 * - live, on every `scan:report` for the currently-open project (owner
 *   Block 7 bugfix: previously the badge only refreshed on remount) — see
 *   `mergeScanStatuses` (source-status-pure.ts) for the merge rule itself,
 *   unit-tested independently of this hook.
 *
 * `refresh(sourceId)` re-runs the same per-source check on demand — backs
 * the manual "Обновить" button, kept for an out-of-band check (e.g. right
 * after fixing a network share) independent of the next scheduled scan. */
function useSourceStatuses(
  sources: ProjectSource[],
  currentProject: OpenProject | null
): {
  statuses: Record<string, SourceStatus>
  errors: Record<string, string>
  refresh: (sourceId: string) => Promise<void>
} {
  const [statuses, setStatuses] = useState<Record<string, SourceStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  // `isMounted` defaults to "yes" so `refresh` (called directly from a click
  // handler, outside of any effect) behaves exactly as before; the mount
  // effect below passes its own flag, same "mounted" convention as
  // SourcesActivity's/ExplorerActivity's own load effects — a source list
  // that changes again (project switch, add/remove) before a previous
  // check's promise resolves must not let that stale result overwrite the
  // freshly-reset statuses.
  async function check(sourceId: string, isMounted: () => boolean = () => true): Promise<void> {
    setStatuses((prev) => ({ ...prev, [sourceId]: 'checking' }))
    try {
      const result = await window.aecpilot.getSourceStatus(sourceId)
      if (!isMounted()) return
      if (!result.ok) {
        setStatuses((prev) => ({ ...prev, [sourceId]: 'error' }))
        setErrors((prev) => ({ ...prev, [sourceId]: result.error }))
        return
      }
      setStatuses((prev) => ({ ...prev, [sourceId]: result.status }))
    } catch (err) {
      if (!isMounted()) return
      setStatuses((prev) => ({ ...prev, [sourceId]: 'error' }))
      setErrors((prev) => ({
        ...prev,
        [sourceId]: err instanceof Error ? err.message : String(err)
      }))
    }
  }

  useEffect(() => {
    let mounted = true
    setStatuses({})
    setErrors({})
    for (const source of sources) void check(source.id, () => mounted)
    return () => {
      mounted = false
    }
  }, [sources])

  useEffect(() => {
    return window.aecpilot.onScanReport((envelope) => {
      const known = new Set(sources.map((s) => s.id))
      setStatuses((prev) =>
        mergeScanStatuses(prev, envelope, currentProject?.vaultPath ?? null, known)
      )
    })
  }, [sources, currentProject])

  return { statuses, errors, refresh: check }
}

/** "Источники" activity content (task 1.7, restyled to match
 * design/screens/Sources.html per task 1.5.5): lists the current project's
 * connected sources as cards and offers "Добавить источник" (pick a folder
 * -> `sources:add`). A two-step confirm handles `needsConfirm` (path
 * overlaps an existing source, and/or is currently inaccessible) —
 * re-submitting with `confirmed: true` adds it anyway. Validation errors
 * (nesting inside the vault, exact duplicate) always block and are shown
 * inline. Re-fetches the list whenever `currentProject` changes, which also
 * covers `project:opened` (Shell.tsx updates `currentProject` on that
 * event).
 *
 * Task 1.5.5 drops this activity's own per-source expand/subtree browsing
 * (task 1.8's original design) — that now lives in the "Проводник" activity,
 * per specs/workspace-sources.md's "единое дерево-проводник" (UR2): this
 * manager's job is add/status/disconnect only, matching the mockup, which
 * has no inline tree at all. */
function SourcesActivity({ currentProject }: { currentProject: OpenProject | null }) {
  const [sources, setSources] = useState<ProjectSource[]>([])
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [confirm, setConfirm] = useState<{ rootPath: string; warnings: string[] } | undefined>(
    undefined
  )
  const { statuses, errors: statusErrors, refresh } = useSourceStatuses(sources, currentProject)

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
          <SourceCard
            key={source.id}
            source={source}
            status={statuses[source.id] ?? 'checking'}
            statusError={statusErrors[source.id]}
            onRefresh={() => void refresh(source.id)}
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

/** One connected source, as a card matching design/screens/Sources.html's
 * structure (icon, name + RO badge + status pill, mono path, actions) —
 * adapted onto the sidebar's existing tokens/width (the mockup's own card is
 * a wide standalone-window layout; the file/indexed/stale counters it shows
 * need scan data this app doesn't persist per-source yet, so those are left
 * out rather than half-faked). Actions are icon buttons (owner Block 4
 * bugfix: text buttons — "Отключить" alongside a visible "Обновить" —
 * didn't fit the sidebar's width; icons do, and match the mockup). */
function SourceCard({
  source,
  status,
  statusError,
  onRefresh,
  onDetached
}: {
  source: ProjectSource
  status: SourceStatus
  statusError?: string
  onRefresh: () => void
  onDetached: (sourceId: string) => void
}) {
  const [confirmingDetach, setConfirmingDetach] = useState(false)
  const [detaching, setDetaching] = useState(false)
  const [detachError, setDetachError] = useState<string | undefined>(undefined)
  const [showError, setShowError] = useState<string | undefined>(undefined)

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

  async function handleShowInExplorer(): Promise<void> {
    setShowError(undefined)
    try {
      const result = await window.aecpilot.showSourceEntryInExplorer(source.id, '')
      if (!result.ok) setShowError(result.error)
    } catch (err) {
      setShowError(err instanceof Error ? err.message : String(err))
    }
  }

  const pill = STATUS_PILL[status]
  const note =
    status === 'unavailable'
      ? 'Путь недоступен — источник не сканируется, остальные источники работают'
      : status === 'error'
        ? statusError
        : undefined

  return (
    <li
      className={`sources-panel__card${status === 'unavailable' ? ' sources-panel__card--unavailable' : ''}`}
    >
      <div className="sources-panel__card-head">
        <div className="sources-panel__card-icon">
          <SourcesIcon width={19} height={19} />
        </div>
        <div className="sources-panel__card-main">
          <div className="sources-panel__card-title-row">
            <span className="sources-panel__card-name">{displaySourceName(source.root_path)}</span>
            <span className="sources-panel__ro-badge">RO</span>
            <span className={`sources-panel__pill sources-panel__pill--${pill.modifier}`}>
              <span className="sources-panel__pill-dot" />
              {pill.label}
            </span>
          </div>
          <div className="sources-panel__card-path" title={source.root_path}>
            {source.root_path}
          </div>
          {note && <div className="sources-panel__card-note">{note}</div>}
          {showError && <div className="sources-panel__error">{showError}</div>}
        </div>
        <div className="sources-panel__card-actions">
          {status === 'unavailable' && (
            <button
              type="button"
              className="sources-panel__icon-btn"
              title="Обновить"
              onClick={onRefresh}
            >
              <ScanIcon width={14} height={14} />
            </button>
          )}
          <button
            type="button"
            className="sources-panel__icon-btn"
            title="Показать в проводнике"
            onClick={() => void handleShowInExplorer()}
          >
            <FolderOpenIcon width={14} height={14} />
          </button>
          <button
            type="button"
            className="sources-panel__icon-btn"
            title="Отключить"
            onClick={() => {
              setDetachError(undefined)
              setConfirmingDetach(true)
            }}
          >
            <PowerIcon width={14} height={14} />
          </button>
        </div>
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
    </li>
  )
}

/** Identifies the currently-selected node of the "Проводник" tab's source
 * section (task 1.5.5) — `rel: ''` is a source's own root row. Kept separate
 * from `ExplorerActivity`'s vault `selected` (a react-arborist `NodeApi`):
 * only one of the two is ever non-null, enforced by the selection handlers
 * clearing the other. */
interface SelectedSourceEntry {
  sourceId: string
  rel: string
}

/** Recursively renders a connected source's already-loaded subtree inside
 * the "Проводник" tab (task 1.5.5, formerly task 1.8's `SourceTreeChildren`,
 * moved here — see `SourcesActivity`'s doc comment). Plain nested rows with
 * per-node expand/collapse state, not react-arborist: unlike the single
 * vault tree (one fixed-size virtualized list), each source here is an
 * independent, variable-height subtree in a naturally-scrolling section,
 * which react-arborist's `Tree` isn't built for — reuses the vault tree's
 * own row classes (`vault-tree__row`/`__icon`/`__name`) so it looks like the
 * same tree, per UR2. Read-only: clicking a folder only toggles it
 * open/closed, clicking a file only selects it (no viewer yet, same as the
 * vault tree's file rows) — no write operations exist for a source node at
 * any depth. */
function ExplorerSourceChildren({
  sourceId,
  nodes,
  depth,
  selected,
  onSelect
}: {
  sourceId: string
  nodes: SourceTreeNode[]
  depth: number
  selected: SelectedSourceEntry | null
  onSelect: (entry: SelectedSourceEntry) => void
}) {
  return (
    <>
      {nodes.map((node) => (
        <ExplorerSourceRow
          key={node.path}
          sourceId={sourceId}
          node={node}
          depth={depth}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function ExplorerSourceRow({
  sourceId,
  node,
  depth,
  selected,
  onSelect
}: {
  sourceId: string
  node: SourceTreeNode
  depth: number
  selected: SelectedSourceEntry | null
  onSelect: (entry: SelectedSourceEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const isDir = node.type === 'dir'
  const isSelected = selected?.sourceId === sourceId && selected.rel === node.path

  return (
    <div>
      <div
        className={`vault-tree__row${isSelected ? ' vault-tree__row--selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => {
          onSelect({ sourceId, rel: node.path })
          if (isDir) setOpen((o) => !o)
        }}
      >
        <span className="vault-tree__icon">{isDir ? (open ? '📂' : '📁') : '📄'}</span>
        <span className="vault-tree__name">{node.name}</span>
      </div>
      {isDir && open && node.children && (
        <ExplorerSourceChildren
          sourceId={sourceId}
          nodes={node.children}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

/** One connected source's root row in the "Проводник" tab (task 1.5.5,
 * folding task 1.8's sidebar source-tree entry into the unified explorer
 * tree per UR2/PLAN §Architecture: "Деревья vault и источников — один
 * паттерн"). Same expand/RO-badge/lazy-subtree/status contract as task
 * 1.8's original sidebar entry (`getSourceStatus` on load, `getSourceTree`
 * only once expanded and only when `status === 'ok'`), restyled onto the
 * vault tree's own row classes. `status` is owned by the parent
 * (`useSourceStatuses`, shared with the "Источники" manager cards) so a
 * `scan:report` updates this row without a remount (owner Block 7 bugfix). */
function ExplorerSourceRoot({
  source,
  status,
  onRefresh,
  selected,
  onSelect
}: {
  source: ProjectSource
  status: SourceStatus
  onRefresh: () => void
  selected: SelectedSourceEntry | null
  onSelect: (entry: SelectedSourceEntry) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [treeState, setTreeState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [tree, setTree] = useState<SourceTreeNode[]>([])
  const [treeError, setTreeError] = useState<string | undefined>(undefined)
  const isSelected = selected?.sourceId === source.id && selected.rel === ''

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
        // dropped mid-session) — nothing to show; the row's own badge is
        // driven by `status`, owned by the parent.
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

  function handleClick(): void {
    onSelect({ sourceId: source.id, rel: '' })
    setExpanded((prev) => {
      const next = !prev
      if (next && status === 'ok' && treeState === 'idle') void loadTree()
      return next
    })
  }

  return (
    <div className="explorer-panel__source">
      <div
        className={`vault-tree__row${isSelected ? ' vault-tree__row--selected' : ''}`}
        title={source.root_path}
        onClick={handleClick}
      >
        <span className="vault-tree__icon">{expanded ? '📂' : '📁'}</span>
        <span className="vault-tree__name">{displaySourceName(source.root_path)}</span>
        <span className="sources-panel__ro-badge">RO</span>
        {status === 'unavailable' && (
          <span className="sources-panel__unavailable-badge">недоступен</span>
        )}
        {status === 'unavailable' && (
          <button
            type="button"
            className="explorer-panel__source-refresh"
            onClick={(e) => {
              e.stopPropagation()
              onRefresh()
            }}
          >
            Обновить
          </button>
        )}
      </div>

      {expanded && (
        <div className="explorer-panel__source-body">
          {status === 'checking' && (
            <div className="explorer-panel__empty">Проверка доступности…</div>
          )}
          {status === 'unavailable' && (
            <div className="explorer-panel__empty">Источник недоступен</div>
          )}
          {status === 'error' && (
            <div className="explorer-panel__error">Не удалось проверить источник</div>
          )}
          {status === 'ok' && treeState === 'loading' && (
            <div className="explorer-panel__empty">Загрузка…</div>
          )}
          {status === 'ok' && treeState === 'error' && (
            <div className="explorer-panel__error">{treeError}</div>
          )}
          {status === 'ok' && treeState === 'ok' && tree.length === 0 && (
            <div className="explorer-panel__empty">Источник пуст</div>
          )}
          {status === 'ok' && treeState === 'ok' && tree.length > 0 && (
            <ExplorerSourceChildren
              sourceId={source.id}
              nodes={tree}
              depth={1}
              selected={selected}
              onSelect={onSelect}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** One row of the vault explorer tree: a dir/file icon, the name (or an
 * inline rename input while `node.isEditing` — react-arborist's own edit
 * mode, committed with Enter/`node.submit()` or discarded with Escape/blur/
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

/** "Проводник" activity content (task 1.6, extended by task 1.5.5): a
 * react-arborist tree of the current project's vault, backed by
 * `vault:tree`, with the project's connected sources listed in a section
 * right below it — same visual row pattern (`vault-tree__row` etc.), RO
 * badge + live availability status, lazy per-source subtree (see
 * `ExplorerSourceRoot`) — per specs/workspace-sources.md's "единое
 * дерево-проводник" (UR2). Create (+файл/+папка, targeting the selected
 * folder or its selected file's parent, else the root) and delete (with a
 * trash-bound confirm) are plain toolbar buttons, vault-only — a source node
 * has no write operations at all, by construction. Rename reuses
 * react-arborist's own inline edit mode. "Показать в проводнике"/
 * "Копировать путь" work for whichever of the two trees is currently
 * selected (vault or source; only one ever is). Every vault-write operation
 * reloads the tree from `vault:tree` afterwards — task 1.6 explicitly
 * decided against a live filesystem watcher, favoring a manual "Обновить"
 * button instead. */
function ExplorerActivity({ currentProject }: { currentProject: OpenProject | null }) {
  const treeRef = useRef<TreeApi<VaultTreeNode> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [tree, setTree] = useState<VaultTreeNode[]>([])
  const [selected, setSelected] = useState<NodeApi<VaultTreeNode> | null>(null)
  const [sources, setSources] = useState<ProjectSource[]>([])
  const [selectedSource, setSelectedSource] = useState<SelectedSourceEntry | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState<{ type: 'file' | 'dir'; parentRel: string } | undefined>(
    undefined
  )
  const [creatingName, setCreatingName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<VaultTreeNode | undefined>(undefined)
  const { statuses, refresh } = useSourceStatuses(sources, currentProject)

  async function load(): Promise<void> {
    const nextTree = currentProject ? await window.aecpilot.getVaultTree() : []
    setTree(nextTree)
  }

  useEffect(() => {
    async function reset(): Promise<void> {
      setSelected(null)
      setSelectedSource(null)
      setCreating(undefined)
      setDeleteTarget(undefined)
      setError(undefined)
      await load()
      const list = currentProject ? await window.aecpilot.listSources() : []
      setSources(list)
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

  function selectVaultNode(nodes: NodeApi<VaultTreeNode>[]): void {
    setSelected(nodes[0] ?? null)
    setSelectedSource(null)
  }

  function selectSourceEntry(entry: SelectedSourceEntry): void {
    setSelectedSource(entry)
    setSelected(null)
    treeRef.current?.deselectAll()
  }

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
    setError(undefined)
    if (selectedSource) {
      const result = await window.aecpilot.showSourceEntryInExplorer(
        selectedSource.sourceId,
        selectedSource.rel
      )
      if (!result.ok) setError(result.error)
      return
    }
    if (!selected) return
    const result = await window.aecpilot.showVaultEntryInExplorer(selected.data.path)
    if (!result.ok) setError(result.error)
  }

  // Task 1.5.5 (specs/workspace-sources.md § UI-операции: "«Копировать
  // путь» — любой узел"): scoped to source nodes for this task — the vault
  // side of this button is a separate, not-yet-requested extension. The
  // absolute path always comes from main's resolver (`sources:get-entry-
  // path`); this never concatenates `rootPath`/`rel` itself.
  async function handleCopyPath(): Promise<void> {
    if (!selectedSource) return
    setError(undefined)
    const result = await window.aecpilot.getSourceEntryPath(
      selectedSource.sourceId,
      selectedSource.rel
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    try {
      await navigator.clipboard.writeText(result.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!currentProject) {
    return <div className="sidebar__empty">Откройте проект, чтобы увидеть дерево vault.</div>
  }

  return (
    <div className="explorer-panel">
      <div className="explorer-panel__toolbar">
        <button
          type="button"
          className="explorer-panel__btn"
          disabled={!!selectedSource}
          onClick={() => openCreate('file')}
        >
          + файл
        </button>
        <button
          type="button"
          className="explorer-panel__btn"
          disabled={!!selectedSource}
          onClick={() => openCreate('dir')}
        >
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
          disabled={!selected && !selectedSource}
          onClick={() => void handleShowInExplorer()}
        >
          Показать в проводнике
        </button>
        <button
          type="button"
          className="explorer-panel__btn"
          disabled={!selectedSource}
          onClick={() => void handleCopyPath()}
        >
          Копировать путь
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
            onSelect={selectVaultNode}
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

      <div className="explorer-panel__sources">
        <div className="explorer-panel__sources-header">Источники</div>
        {sources.length === 0 ? (
          <div className="explorer-panel__empty">Источники не подключены</div>
        ) : (
          sources.map((source) => (
            <ExplorerSourceRoot
              key={source.id}
              source={source}
              status={statuses[source.id] ?? 'checking'}
              onRefresh={() => void refresh(source.id)}
              selected={selectedSource}
              onSelect={selectSourceEntry}
            />
          ))
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
