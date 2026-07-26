import { useEffect, useRef, useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent, SVGProps } from 'react'
import { Tree, type NodeApi, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ACTIVITIES, type ActivityId } from './activities'
import {
  ClearIcon,
  CopyIcon,
  FilePlusIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PowerIcon,
  RenameIcon,
  ScanIcon,
  SearchIcon,
  SourcesIcon,
  TrashIcon
} from './icons'
import { mergeScanStatuses, type SourceStatus } from './source-status-pure'
import {
  matchesSearchQuery,
  splitBySearchQuery,
  subtreeMatchesSearchQuery
} from './explorer-search-pure'
import {
  contextMenuSections,
  type ContextMenuAction,
  type ExplorerNodeKind
} from './explorer-context-menu-pure'
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
  onSelect,
  onContextMenu,
  query
}: {
  sourceId: string
  nodes: SourceTreeNode[]
  depth: number
  selected: SelectedSourceEntry | null
  onSelect: (entry: SelectedSourceEntry) => void
  onContextMenu: (event: ReactMouseEvent, entry: SelectedSourceEntry) => void
  query: string
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
          onContextMenu={onContextMenu}
          query={query}
        />
      ))}
    </>
  )
}

/** A source's tree is fetched whole on first expand (`getSourceTree`), so
 * `node.children` already holds every descendant regardless of which
 * folders are currently toggled open — `subtreeMatchesSearchQuery` can
 * therefore check arbitrarily deep for a match without any extra fetch.
 * task 1.5.6 deliberately does *not* auto-expand a folder just because a
 * search matches something inside it (unlike the vault tree, which gets
 * that for free from react-arborist): a folder containing a match stays
 * visible as a hint, but still needs a manual click to reveal it — see the
 * task's own report for the full rationale. */
function ExplorerSourceRow({
  sourceId,
  node,
  depth,
  selected,
  onSelect,
  onContextMenu,
  query
}: {
  sourceId: string
  node: SourceTreeNode
  depth: number
  selected: SelectedSourceEntry | null
  onSelect: (entry: SelectedSourceEntry) => void
  onContextMenu: (event: ReactMouseEvent, entry: SelectedSourceEntry) => void
  query: string
}) {
  const [open, setOpen] = useState(false)
  const isDir = node.type === 'dir'
  const isSelected = selected?.sourceId === sourceId && selected.rel === node.path

  if (!subtreeMatchesSearchQuery(node, query)) return null
  const { pre, match, post } = splitBySearchQuery(node.name, query)

  return (
    <div>
      <div
        className={`vault-tree__row${isSelected ? ' vault-tree__row--selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => {
          onSelect({ sourceId, rel: node.path })
          if (isDir) setOpen((o) => !o)
        }}
        onContextMenu={(e) => onContextMenu(e, { sourceId, rel: node.path })}
      >
        <span className="vault-tree__icon">{isDir ? (open ? '📂' : '📁') : '📄'}</span>
        <span className="vault-tree__name">
          {pre}
          {match && <mark className="vault-tree__match">{match}</mark>}
          {post}
        </span>
      </div>
      {isDir && open && node.children && (
        <ExplorerSourceChildren
          sourceId={sourceId}
          nodes={node.children}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          query={query}
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
  onSelect,
  onContextMenu,
  query
}: {
  source: ProjectSource
  status: SourceStatus
  onRefresh: () => void
  selected: SelectedSourceEntry | null
  onSelect: (entry: SelectedSourceEntry) => void
  onContextMenu: (event: ReactMouseEvent, entry: SelectedSourceEntry) => void
  query: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [treeState, setTreeState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [tree, setTree] = useState<SourceTreeNode[]>([])
  const [treeError, setTreeError] = useState<string | undefined>(undefined)
  const isSelected = selected?.sourceId === source.id && selected.rel === ''
  const displayName = displaySourceName(source.root_path)

  // A source whose subtree hasn't been fetched yet (`treeState !== 'ok'`) has
  // nothing loaded to search — per task 1.5.6's report, that's left visible
  // rather than hidden (we never filter out a source we can't yet verify).
  // Once loaded, it hides only when neither its own name nor anything in its
  // already-fetched subtree matches (same ancestor-of-a-match rule as the
  // vault tree, applied by hand — see subtreeMatchesSearchQuery).
  const visible =
    treeState !== 'ok' ||
    matchesSearchQuery(displayName, query) ||
    tree.some((node) => subtreeMatchesSearchQuery(node, query))

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

  if (!visible) return null
  const { pre, match, post } = splitBySearchQuery(displayName, query)

  return (
    <div className="explorer-panel__source">
      <div
        className={`vault-tree__row${isSelected ? ' vault-tree__row--selected' : ''}`}
        title={source.root_path}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, { sourceId: source.id, rel: '' })}
      >
        <span className="vault-tree__icon">{expanded ? '📂' : '📁'}</span>
        <span className="vault-tree__name">
          {pre}
          {match && <mark className="vault-tree__match">{match}</mark>}
          {post}
        </span>
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
              onContextMenu={onContextMenu}
              query={query}
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
 * select only"). Reads the active search query straight off `node.tree`
 * (task 1.5.6) rather than a prop of its own — react-arborist calls this
 * renderer directly, with no extra slot to pass one through.
 *
 * `data-vault-path` (task 1.5.7) exists for the same reason: react-arborist
 * gives this renderer a fixed prop set (`node`/`tree`/`style`/`dragHandle`),
 * with no room for a custom "open the context menu" callback from
 * `ExplorerActivity`. Instead, the right-click is handled once, up on
 * `<Tree onContextMenu>` (a native prop), which reads this attribute off
 * `event.target` to look the clicked `NodeApi` back up via `tree.get(id)` —
 * see `ExplorerActivity`'s `handleVaultContextMenu`. */
function VaultTreeRow({ node, style, dragHandle }: NodeRendererProps<VaultTreeNode>) {
  const { pre, match, post } = splitBySearchQuery(node.data.name, node.tree.searchTerm)
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`vault-tree__row${node.isSelected ? ' vault-tree__row--selected' : ''}`}
      data-vault-path={node.data.path}
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
        <span className="vault-tree__name">
          {pre}
          {match && <mark className="vault-tree__match">{match}</mark>}
          {post}
        </span>
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

const CONTEXT_MENU_ICONS: Record<
  ContextMenuAction,
  (props: SVGProps<SVGSVGElement>) => JSX.Element
> = {
  'show-in-explorer': FolderOpenIcon,
  'copy-path': CopyIcon,
  rename: RenameIcon,
  'create-file': FilePlusIcon,
  'create-dir': FolderPlusIcon,
  delete: TrashIcon
}

/** Per-node right-click menu (task 1.5.7): positioned at the cursor,
 * closes on an outside click or Escape (same pattern as
 * chat/SessionMenu.tsx and shell/ProjectMenu.tsx). Which commands it shows,
 * and their order/grouping (a divider between sections), comes from
 * `contextMenuSections` (explorer-context-menu-pure.ts, unit-tested on its
 * own) — this component only renders that list and dispatches the chosen
 * action back to `onAction` (`ExplorerActivity`'s `handleContextMenuAction`,
 * which calls the exact same handlers the toolbar used to call directly). */
function ExplorerContextMenu({
  kind,
  x,
  y,
  onAction,
  onClose
}: {
  kind: ExplorerNodeKind
  x: number
  y: number
  onAction: (action: ContextMenuAction) => void
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div ref={containerRef} className="context-menu" style={{ top: y, left: x }}>
      {contextMenuSections(kind).map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {sectionIndex > 0 && <div className="context-menu__separator" />}
          {section.map((item) => {
            const Icon = CONTEXT_MENU_ICONS[item.action]
            return (
              <button
                key={item.action}
                type="button"
                className={`context-menu__item${item.danger ? ' context-menu__item--danger' : ''}`}
                onClick={() => {
                  onAction(item.action)
                  onClose()
                }}
              >
                <Icon width={15} height={15} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** "Проводник" activity content (task 1.6, extended by task 1.5.5, toolbar
 * + search icon-ified by task 1.5.6, rename/delete/show/copy moved from the
 * toolbar to a per-node context menu by task 1.5.7, all per
 * design/screens/Explorer.html): a react-arborist tree of the current
 * project's vault, backed by `vault:tree`, with the project's connected
 * sources listed in a section right below it — same visual row pattern
 * (`vault-tree__row` etc.), RO badge + live availability status, lazy
 * per-source subtree (see `ExplorerSourceRoot`) — per
 * specs/workspace-sources.md's "единое дерево-проводник" (UR2).
 *
 * The toolbar (task 1.5.7) only keeps create-file/create-folder (targeting
 * the selected folder or its selected file's parent, else the root) and
 * refresh — vault-only, a source node has no write operations at all, by
 * construction. Every other per-node command (rename — reuses react-
 * arborist's own inline edit mode; delete — a trash-bound confirm;
 * "Показать в проводнике"; "Копировать путь") now lives in `ExplorerContext
 * Menu`, opened by right-clicking any node (vault or source); a right-click
 * also selects that node first, so the menu's actions read `selected`/
 * `selectedSource` exactly like the old toolbar buttons did — same handlers,
 * just a different trigger. Deleting the selected vault node also has a
 * keyboard shortcut, Del, handled directly on the tree's own container
 * (`explorer-panel__tree`) so it never fires while typing in the search box,
 * the chat composer, or an inline rename — none of those live inside that
 * container, and the rename `<input>` that does is excluded explicitly.
 *
 * Every vault-write operation reloads the tree from `vault:tree` afterwards
 * — task 1.6 explicitly decided against a live filesystem watcher, favoring
 * a manual "Обновить" button instead. The search box (task 1.5.6) filters
 * both trees by name substring, case-insensitive: the vault side hands
 * `query` straight to react-arborist's own `searchTerm`/`searchMatch` (which
 * keeps a non-matching folder visible, and open, when a descendant of it
 * matches); the hand-rolled sources section reimplements the same rule
 * itself — see `ExplorerSourceRoot`'s and `ExplorerSourceRow`'s own doc
 * comments. */
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
  const [query, setQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<
    { kind: ExplorerNodeKind; x: number; y: number } | undefined
  >(undefined)
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
      setQuery('')
      setContextMenu(undefined)
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
    // Only a real vault selection clears the source one. An EMPTY selection
    // must not: react-arborist's `deselectAll()` fires `onSelect` with `[]`
    // ("setSelection fires onSelect", tree-api.js), and `selectSourceEntry`
    // below calls it right after setting `selectedSource` — so clearing here
    // unconditionally wiped the source that was just selected, leaving both
    // context-menu commands with nothing to act on. They then returned
    // silently, which is the "кнопки не работают" report from the manual run.
    if (nodes.length > 0) setSelectedSource(null)
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
  // путь» — любой узел"): source-only through task 1.5.6; task 1.5.7 extends
  // it to the vault side too (now that "Копировать путь" is a per-node
  // context-menu command, offered for a vault node as well). Either branch's
  // absolute path always comes from main's own resolver (`sources:get-entry-
  // path` / `vault:get-entry-path`) — this never concatenates
  // `rootPath`/vault root with `rel` itself.
  async function handleCopyPath(): Promise<void> {
    setError(undefined)
    const result = selectedSource
      ? await window.aecpilot.getSourceEntryPath(selectedSource.sourceId, selectedSource.rel)
      : selected
        ? await window.aecpilot.getVaultEntryPath(selected.data.path)
        : undefined
    if (!result) return
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

  // Task 1.5.7: right-clicking a vault node also selects it (`node.select()`
  // dispatches react-arborist's own `onSelect` → `selectVaultNode`, exactly
  // like a left click would), then opens the context menu at the cursor.
  // Delegated on `<Tree onContextMenu>` (a native, well-typed react-arborist
  // prop fired on its outer container) rather than handled inside
  // `VaultTreeRow` itself — react-arborist calls that renderer with a fixed
  // prop set, with no slot for a custom callback; `data-vault-path` (set on
  // every row, see `VaultTreeRow`) is how the clicked node is recovered here.
  function handleVaultContextMenu(event: ReactMouseEvent): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const rowEl = target.closest<HTMLElement>('[data-vault-path]')
    if (!rowEl) return
    const node = treeRef.current?.get(rowEl.dataset.vaultPath ?? '')
    if (!node || node.isEditing) return
    event.preventDefault()
    node.select()
    setContextMenu({
      kind: node.data.type === 'dir' ? 'vault-dir' : 'vault-file',
      x: event.clientX,
      y: event.clientY
    })
  }

  // A source row has direct access to its own `sourceId`/`rel` already (see
  // `ExplorerSourceRoot`/`ExplorerSourceRow`), so this is wired as an
  // ordinary prop — no delegation trick needed, unlike the vault side.
  function handleSourceContextMenu(event: ReactMouseEvent, entry: SelectedSourceEntry): void {
    event.preventDefault()
    selectSourceEntry(entry)
    setContextMenu({ kind: 'source', x: event.clientX, y: event.clientY })
  }

  // Dispatches a chosen context-menu command to the exact same handler the
  // toolbar used to call directly (task 1.5.7's brief: "те же обработчики,
  // что в тулбаре") — by the time a menu item is clicked, `selected`/
  // `selectedSource` already point at the right-clicked node (set when the
  // menu was opened, above).
  function handleContextMenuAction(action: ContextMenuAction): void {
    switch (action) {
      case 'show-in-explorer':
        void handleShowInExplorer()
        return
      case 'copy-path':
        void handleCopyPath()
        return
      case 'rename':
        void selected?.edit()
        return
      case 'create-file':
        openCreate('file')
        return
      case 'create-dir':
        openCreate('dir')
        return
      case 'delete':
        if (selected) setDeleteTarget(selected.data)
        return
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
          className="explorer-panel__icon-btn"
          title="Создать файл"
          aria-label="Создать файл"
          disabled={!!selectedSource}
          onClick={() => openCreate('file')}
        >
          <FilePlusIcon width={15} height={15} />
        </button>
        <button
          type="button"
          className="explorer-panel__icon-btn"
          title="Создать папку"
          aria-label="Создать папку"
          disabled={!!selectedSource}
          onClick={() => openCreate('dir')}
        >
          <FolderPlusIcon width={15} height={15} />
        </button>
        <button
          type="button"
          className="explorer-panel__icon-btn"
          title="Обновить"
          aria-label="Обновить"
          onClick={() => void load()}
        >
          <ScanIcon width={15} height={15} />
        </button>
      </div>

      <div className="explorer-panel__search">
        <SearchIcon width={13} height={13} />
        <input
          type="text"
          className="explorer-panel__search-input"
          placeholder="Поиск по дереву…"
          aria-label="Поиск по дереву"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            className="explorer-panel__search-clear"
            title="Очистить поиск"
            aria-label="Очистить поиск"
            onClick={() => setQuery('')}
          >
            <ClearIcon width={12} height={12} />
          </button>
        )}
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

      <div
        className="explorer-panel__tree"
        ref={containerRef}
        onKeyDown={(e) => {
          // Task 1.5.7: Del deletes the selected vault node (same
          // confirm-first flow as the toolbar/context-menu "Удалить") — but
          // never while the key lands in a form field, most importantly
          // react-arborist's own inline-rename `<input>` (the search box and
          // chat composer already can't reach this handler at all, since
          // neither lives inside this container — see this function's own
          // doc comment). A source node is never `selected` (it uses
          // `selectedSource` instead), so this is already a no-op for it.
          if (e.key !== 'Delete' || !selected) return
          const target = e.target
          if (
            target instanceof HTMLElement &&
            target.closest(
              'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
            )
          ) {
            return
          }
          e.preventDefault()
          setDeleteTarget(selected.data)
        }}
      >
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
            searchTerm={query}
            searchMatch={(node, term) => matchesSearchQuery(node.data.name, term)}
            onSelect={selectVaultNode}
            onContextMenu={handleVaultContextMenu}
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
              onContextMenu={handleSourceContextMenu}
              query={query}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <ExplorerContextMenu
          kind={contextMenu.kind}
          x={contextMenu.x}
          y={contextMenu.y}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(undefined)}
        />
      )}
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
