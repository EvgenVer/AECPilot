import { useEffect, useState } from 'react'
import { ACTIVITIES, type ActivityId } from './activities'
import type { OpenProject, ProjectSource } from '../../../shared/ipc'

const SIDEBAR_EMPTY_HINT: Record<Exclude<ActivityId, 'sources'>, string> = {
  explorer: 'Дерево vault и источников появится здесь (задачи 1.3–1.8).',
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

/** Contextual sidebar (task 1.0): content depends on the active rail
 * activity. "Источники" has real content (task 1.7); every other activity
 * stays a stub naming the section, per the coordinator's Phase-1 scope
 * decision. */
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
      ) : (
        <div className="sidebar__empty">{SIDEBAR_EMPTY_HINT[active]}</div>
      )}
    </aside>
  )
}
