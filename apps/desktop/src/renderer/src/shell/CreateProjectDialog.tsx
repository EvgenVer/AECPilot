import { useState } from 'react'

/** "Create project" modal (task 1.3): pick an empty directory, name the
 * project, generate the vault. Reachable both from the Welcome screen's
 * "Создать проект" action and from the shell's top-bar project placeholder
 * — both render this same component. Opening/switching to an already-
 * existing project is out of scope here (task 1.4). */
export default function CreateProjectDialog({ onClose }: { onClose: () => void }) {
  const [dirPath, setDirPath] = useState<string | undefined>(undefined)
  const [name, setName] = useState('')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

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

  async function handleCreate(): Promise<void> {
    if (!dirPath || name.trim().length === 0) return
    setCreating(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.createProject(dirPath, name)
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
        aria-label="Создать проект"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="project-modal__head">
          <div className="project-modal__title">Создать проект</div>
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
          <span>Пустая папка</span>
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

        <div className="project-modal__actions">
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
            onClick={() => void handleCreate()}
            disabled={!canCreate}
          >
            {creating ? 'Создаю…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}
