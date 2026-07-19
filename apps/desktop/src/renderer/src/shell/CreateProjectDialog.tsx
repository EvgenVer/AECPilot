import { useState } from 'react'

/** "Create project" modal (task 1.3; task 1.5.4 generalized it to also drive
 * Obsidian-style init): pick a directory, name the project, generate the
 * vault. The directory no longer has to be empty — a non-empty one just gets
 * whatever vault structure it's missing, existing files are never touched
 * (specs/workspace-sources.md's "Инициализация проекта в непустой
 * директории"). Reachable from the Welcome screen's "Создать проект" action,
 * the shell's top-bar project menu, and (via `initialDirPath`/`initialName`)
 * from `ProjectMenu`'s/`Welcome`'s "open a folder that isn't a project yet"
 * flow — all render this same component. `initialDirPath`/`initialName`
 * pre-fill the folder/name fields (still editable) for that last case,
 * where the folder was already picked by the user one step earlier and
 * `openProject` suggested a name from the folder itself. */
export default function CreateProjectDialog({
  onClose,
  initialDirPath,
  initialName
}: {
  onClose: () => void
  initialDirPath?: string
  initialName?: string
}) {
  const isInit = Boolean(initialDirPath)
  const [dirPath, setDirPath] = useState<string | undefined>(initialDirPath)
  const [name, setName] = useState(initialName ?? '')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // Task 1.5.4: the target directory already has its own AGENTS.md/.aecpilot
  // (not recognized as an existing AECPilot project) — same two-step confirm
  // shape as Sidebar.tsx's SourcesActivity needsConfirm panel. Re-submitting
  // with `confirmed: true` leaves those files exactly as they are and only
  // adds the missing vault structure around them.
  const [conflicts, setConflicts] = useState<string[] | undefined>(undefined)

  async function handlePick(): Promise<void> {
    setPicking(true)
    setError(undefined)
    try {
      const picked = await window.aecpilot.pickProjectDirectory()
      if (picked) setDirPath(picked)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPicking(false)
    }
  }

  async function submitCreate(confirmed: boolean): Promise<void> {
    if (!dirPath || name.trim().length === 0) return
    setCreating(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.createProject(dirPath, name, confirmed)
      if ('needsConfirm' in result) {
        setConflicts(result.needsConfirm)
        return
      }
      setConflicts(undefined)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const canCreate = Boolean(dirPath) && name.trim().length > 0 && !creating

  return (
    <div className="project-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="project-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isInit ? 'Инициализировать проект' : 'Создать проект'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="project-modal__head">
          <div className="project-modal__title">
            {isInit ? 'Инициализировать проект' : 'Создать проект'}
          </div>
          <button
            type="button"
            className="project-modal__close"
            onClick={onClose}
            disabled={creating}
          >
            ✕
          </button>
        </div>

        <label className="project-modal__field">
          Название проекта
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Объект-X"
            disabled={creating}
          />
        </label>

        <div className="project-modal__field">
          <span>Папка проекта (может быть непустой — недостающие файлы будут добавлены)</span>
          <div className="project-modal__path-row">
            <div className="project-modal__path">{dirPath ?? 'не выбрана'}</div>
            <button
              type="button"
              className="project-modal__pick-btn"
              onClick={() => void handlePick()}
              disabled={picking || creating}
            >
              {picking ? 'Выбор…' : 'Выбрать папку'}
            </button>
          </div>
        </div>

        {error && <div className="project-modal__error">{error}</div>}

        {conflicts && (
          <div className="project-modal__field">
            {conflicts.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        )}

        <div className="project-modal__actions">
          {conflicts ? (
            <>
              <button
                type="button"
                className="project-modal__btn"
                onClick={() => setConflicts(undefined)}
                disabled={creating}
              >
                Отмена
              </button>
              <button
                type="button"
                className="project-modal__btn project-modal__btn--primary"
                onClick={() => void submitCreate(true)}
                disabled={creating}
              >
                {creating ? 'Инициализация…' : 'Инициализировать всё равно'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="project-modal__btn"
                onClick={onClose}
                disabled={creating}
              >
                Отмена
              </button>
              <button
                type="button"
                className="project-modal__btn project-modal__btn--primary"
                onClick={() => void submitCreate(false)}
                disabled={!canCreate}
              >
                {creating
                  ? isInit
                    ? 'Инициализирую…'
                    : 'Создаю…'
                  : isInit
                    ? 'Инициализировать'
                    : 'Создать'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
