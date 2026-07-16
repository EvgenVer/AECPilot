import { FilesIcon, ScanIcon, SearchIcon, SettingsIcon } from './icons'
import SettingsPanel from '../chat/SettingsPanel'
import type { OpenProject } from '../../../shared/ipc'

/** Top bar (task 1.0): app identity + inert placeholders matching the
 * approved shell layout (design/DESIGN_BRIEF.md §3). The project placeholder
 * is wired to open the create-project modal (task 1.3) while no project is
 * open; once one is, it shows the project name and creating another is out
 * of scope (opening/switching is task 1.4). The command palette trigger and
 * "scan now" stay visual-only — no command palette task scheduled, scanning
 * is Phase 2. The settings entry point reuses the existing LLM settings
 * popover from Phase 0, anchored here (a `position: relative` wrapper around
 * this gear button) even though the rail's bottom settings icon can also
 * open it — both triggers share the one `settingsOpen` state lifted to
 * Shell. */
export default function TopBar({
  settingsOpen,
  settingsDisabled,
  onToggleSettings,
  onCloseSettings,
  onSettingsRestarted,
  currentProject,
  onOpenCreateProject
}: {
  settingsOpen: boolean
  settingsDisabled: boolean
  onToggleSettings: () => void
  onCloseSettings: () => void
  onSettingsRestarted: () => void
  currentProject: OpenProject | null
  onOpenCreateProject: () => void
}) {
  return (
    <header className="topbar" role="banner">
      <div className="topbar__mark" aria-hidden="true">
        A
      </div>
      <button
        type="button"
        className="topbar__btn"
        disabled={currentProject !== null}
        onClick={currentProject === null ? onOpenCreateProject : undefined}
        title={
          currentProject
            ? currentProject.vaultPath
            : 'Создать проект — выбрать пустую папку (задача 1.4: открытие существующего — позже)'
        }
      >
        <FilesIcon width={14} height={14} />
        <span>{currentProject ? currentProject.name : 'Проект не открыт'}</span>
      </button>

      <button
        type="button"
        className="topbar__btn topbar__search"
        disabled
        title="Командная палитра — пока не реализована"
      >
        <SearchIcon width={14} height={14} />
        <span>Поиск файлов и команд</span>
        <span className="topbar__kbd">Ctrl K</span>
      </button>

      <button
        type="button"
        className="topbar__btn"
        disabled
        title="Сканирование источников — Phase 2"
      >
        <ScanIcon width={14} height={14} />
        Сканировать
      </button>

      <div className="topbar__spacer" />

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="topbar__icon-btn"
          title="Настройки"
          aria-label="Настройки"
          onClick={onToggleSettings}
        >
          <SettingsIcon width={16} height={16} />
        </button>
        {settingsOpen && (
          <SettingsPanel
            disabled={settingsDisabled}
            onClose={onCloseSettings}
            onRestarted={onSettingsRestarted}
          />
        )}
      </div>
    </header>
  )
}
