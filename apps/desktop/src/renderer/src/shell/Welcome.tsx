import { useEffect, useState } from 'react'
import { FilesIcon } from './icons'
import CreateProjectDialog from './CreateProjectDialog'
import type { RecentProject } from '../../../shared/ipc'

/** Welcome / "choose a project" screen (task 1.0), per
 * design/screens/Welcome.html. Shown only behind the `AEC_SHOW_WELCOME=1`
 * dev flag (see preload/index.ts) — there is no project system yet, so
 * "Создать проект" opens the create-project modal (task 1.3); "Открыть
 * проект" remains an inert placeholder (TODO 1.4). The recents list renders
 * whatever `project:create` has recorded so far — re-opening an entry by
 * clicking it is out of scope here (task 1.4). */
export default function Welcome() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [recents, setRecents] = useState<RecentProject[]>([])

  useEffect(() => {
    let mounted = true
    void window.aecpilot.listRecentProjects().then((list) => {
      if (mounted) setRecents(list)
    })
    return () => {
      mounted = false
    }
  }, [])

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
              disabled
              title="TODO(1.4): открытие проекта"
            >
              <div className="welcome__action-title">Открыть проект</div>
              <div className="welcome__action-desc">Папка с .aecpilot/</div>
            </button>
          </div>

          <div className="welcome__section-title">Недавние проекты</div>
          {recents.length === 0 ? (
            <div className="welcome__empty">
              Пока нет недавних проектов — они появятся здесь после первого создания или открытия
              (задачи 1.3/1.4).
            </div>
          ) : (
            <ul className="welcome__recents">
              {recents.map((project) => (
                <li key={project.vaultPath} className="welcome__recent" title={project.vaultPath}>
                  <div className="welcome__recent-name">{project.name}</div>
                  <div className="welcome__recent-path">{project.vaultPath}</div>
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
