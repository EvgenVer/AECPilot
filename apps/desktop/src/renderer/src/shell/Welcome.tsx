import { FilesIcon } from './icons'

/** Welcome / "choose a project" screen (task 1.0), per
 * design/screens/Welcome.html. Shown only behind the `AEC_SHOW_WELCOME=1`
 * dev flag (see preload/index.ts) — there is no project system yet, so
 * "Создать проект"/"Открыть проект" are inert placeholders (TODO 1.3/1.4)
 * and the recents list is an honest empty state rather than fabricated
 * sample data. */
export default function Welcome() {
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
            <button
              type="button"
              className="welcome__action"
              disabled
              title="TODO(1.3): создание проекта"
            >
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
          <div className="welcome__empty">
            Пока нет недавних проектов — они появятся здесь после первого создания или открытия
            (задачи 1.3/1.4).
          </div>
        </div>
      </div>
    </div>
  )
}
