import { useEffect, useRef, useState } from 'react'
import { Tree, type NodeApi, type NodeRendererProps, type TreeApi } from 'react-arborist'
import { ACTIVITIES, type ActivityId } from './activities'
import type { OpenProject, ProjectSource, VaultTreeNode } from '../../../shared/ipc'

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
          <li key={source.id} className="sources-panel__item" title={source.root_path}>
            {source.root_path}
          </li>
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
