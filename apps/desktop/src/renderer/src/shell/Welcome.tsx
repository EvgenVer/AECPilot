import { useEffect, useState } from 'react'
import { FilesIcon } from './icons'
import CreateProjectDialog from './CreateProjectDialog'
import type { RecentProject } from '../../../shared/ipc'

/** Welcome / "choose a project" screen (task 1.0), per
 * design/screens/Welcome.html. Shown only behind the `AEC_SHOW_WELCOME=1`
 * dev flag (see preload/index.ts). "Создать проект" opens the create-project
 * modal (task 1.3); "Открыть проект" picks an existing vault folder and opens
 * it (task 1.4). Clicking a recents entry re-opens that project directly; an
 * error (e.g. the folder moved/is no longer a valid vault) is shown inline
 * next to that entry — the entry itself is left in the list (removing stale
 * recents is out of scope here). */
export default function Welcome() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<{ vaultPath: string; message: string } | undefined>(
    undefined
  )

  useEffect(() => {
    let mounted = true
    void window.aecpilot.listRecentProjects().then((list) => {
      if (mounted) setRecents(list)
    })
    return () => {
      mounted = false
    }
  }, [])

  async function openVault(vaultPath: string): Promise<void> {
    setOpening(true)
    setOpenError(undefined)
    try {
      const result = await window.aecpilot.openProject(vaultPath)
      if (!result.ok) setOpenError({ vaultPath, message: result.error })
    } finally {
      setOpening(false)
    }
  }

  async function handlePickAndOpen(): Promise<void> {
    setOpenError(undefined)
    const picked = await window.aecpilot.pickProjectDirectory()
    if (picked) await openVault(picked)
  }

  return (
    <div className="welcome">
      <div className="welcome__caption">
        <div className="topbar__mark" aria-hidden="true">
          A
        </div>
        AECPilot
      </div>
      <div className="welcome__body">
        <div className="welcome__content">
          <div className="welcome__brand">
            <div className="welcome__logo" aria-hidden="true">
              <FilesIcon width={30} height={30} stroke="currentColor" />
            </div>
            <div>
              <div className="welcome__name">AECPilot</div>
              <div className="welcome__tagline">IDE для проектной документации</div>
            </div>
          </div>

          <div className="welcome__actions">
            <button type="button" className="welcome__action" onClick={() => setDialogOpen(true)}>
              <div className="welcome__action-title">Создать проект</div>
              <div className="welcome__action-desc">Пустая папка → структура vault</div>
            </button>
            <button
              type="button"
              className="welcome__action"
              onClick={() => void handlePickAndOpen()}
              disabled={opening}
            >
              <div className="welcome__action-title">Открыть проект</div>
              <div className="welcome__action-desc">Папка с .aecpilot/</div>
            </button>
          </div>

          {openError && !recents.some((project) => project.vaultPath === openError.vaultPath) && (
            <div className="welcome__recent-error">{openError.message}</div>
          )}

          <div className="welcome__section-title">Недавние проекты</div>
          {recents.length === 0 ? (
            <div className="welcome__empty">
              Пока нет недавних проектов — они появятся здесь после первого создания или открытия.
            </div>
          ) : (
            <ul className="welcome__recents">
              {recents.map((project) => (
                <li key={project.vaultPath} className="welcome__recent">
                  <button
                    type="button"
                    className="welcome__recent-btn"
                    title={project.vaultPath}
                    onClick={() => void openVault(project.vaultPath)}
                    disabled={opening}
                  >
                    <div className="welcome__recent-name">{project.name}</div>
                    <div className="welcome__recent-path">{project.vaultPath}</div>
                  </button>
                  {openError?.vaultPath === project.vaultPath && (
                    <div className="welcome__recent-error">{openError.message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {dialogOpen && <CreateProjectDialog onClose={() => setDialogOpen(false)} />}
    </div>
  )
}
