import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon, FilesIcon } from './icons'
import CreateProjectDialog from './CreateProjectDialog'
import type { OpenProject, RecentProject } from '../../../shared/ipc'

/** How many recents entries the top-bar project menu shows (task 1.4) —
 * separate from the Welcome screen's full list, which shows all of them. */
const MAX_MENU_RECENTS = 5

/** Top-bar project menu (task 1.4): "открыть проект…" (native folder picker
 * + open), "создать проект…" (delegates to the existing CreateProjectDialog
 * via `onOpenCreateProject`), and up to 5 most-recent projects. Reusable
 * whether or not a project is currently open — opening/switching just
 * replaces `currentProject` (see main/index.ts's `project:open`), which also
 * abandons the active chat session and re-scopes it to the new project (task
 * 1.20). Closes on an outside click, same pattern as chat/SessionMenu.tsx.
 * Task 1.5.4 (Obsidian-style init): opening a folder that isn't a project
 * yet no longer just errors — this renders its own `CreateProjectDialog`
 * instance (independent of the shell's `onOpenCreateProject`-driven one),
 * pre-filled with that folder and a suggested name, so the user can
 * initialize a project there instead. */
export default function ProjectMenu({
  currentProject,
  onOpenCreateProject
}: {
  currentProject: OpenProject | null
  onOpenCreateProject: () => void
}) {
  const [open, setOpen] = useState(false)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [initDialog, setInitDialog] = useState<{ dirPath: string; name: string } | undefined>(
    undefined
  )
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  // Fix-iteration precedent (Sidebar.tsx's SourcesActivity, task 1.7 review):
  // a pending init prompt/error belongs to the project that was open when it
  // was raised — a project switch must clear both, so a stale "Инициализи-
  // ровать" can never fire against whatever project is now open. Declared as
  // a nested function (not inlined in the effect body) — same convention as
  // Sidebar.tsx's SourceEntry mount effect, which keeps this outside
  // `react-hooks/set-state-in-effect`'s reach.
  useEffect(() => {
    function resetForProjectSwitch(): void {
      setInitDialog(undefined)
      setError(undefined)
    }
    resetForProjectSwitch()
  }, [currentProject])

  function handleToggle(): void {
    if (open) {
      setOpen(false)
      return
    }
    setError(undefined)
    setOpen(true)
    void window.aecpilot.listRecentProjects().then(setRecents)
  }

  async function handleOpen(vaultPath: string): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.openProject(vaultPath)
      if ('needsInit' in result) {
        setOpen(false)
        setInitDialog({ dirPath: vaultPath, name: result.suggestedName })
        return
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  async function handlePickAndOpen(): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const picked = await window.aecpilot.pickProjectDirectory()
      if (!picked) return
      const result = await window.aecpilot.openProject(picked)
      if ('needsInit' in result) {
        setOpen(false)
        setInitDialog({ dirPath: picked, name: result.suggestedName })
        return
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  function handleCreate(): void {
    setOpen(false)
    onOpenCreateProject()
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="topbar__btn"
        onClick={handleToggle}
        title={currentProject ? currentProject.vaultPath : 'Открыть или создать проект'}
      >
        <FilesIcon width={14} height={14} />
        <span>{currentProject ? currentProject.name : 'Проект не открыт'}</span>
        <ChevronDownIcon width={12} height={12} />
      </button>

      {open && (
        <div className="session-dropdown">
          <button
            type="button"
            className="session-dropdown__item"
            onClick={() => void handlePickAndOpen()}
            disabled={busy}
          >
            Открыть проект…
          </button>
          <button
            type="button"
            className="session-dropdown__item"
            onClick={handleCreate}
            disabled={busy}
          >
            Создать проект…
          </button>

          {error && <div className="session-dropdown__status settings-popover__error">{error}</div>}

          {recents.length > 0 && (
            <>
              <div className="session-dropdown__status">Недавние</div>
              {recents.slice(0, MAX_MENU_RECENTS).map((project) => (
                <button
                  key={project.vaultPath}
                  type="button"
                  className="session-dropdown__item"
                  title={project.vaultPath}
                  onClick={() => void handleOpen(project.vaultPath)}
                  disabled={busy}
                >
                  {project.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {initDialog && (
        <CreateProjectDialog
          initialDirPath={initDialog.dirPath}
          initialName={initDialog.name}
          onClose={() => setInitDialog(undefined)}
        />
      )}
    </div>
  )
}
