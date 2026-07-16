import { FilesIcon, ScanIcon, SearchIcon, SettingsIcon } from './icons'
import SettingsPanel from '../chat/SettingsPanel'

/** Top bar (task 1.0): app identity + inert placeholders matching the
 * approved shell layout (design/DESIGN_BRIEF.md §3). The project switcher,
 * command palette trigger and "scan now" are visual-only in this task —
 * there is no project system yet (1.3/1.4) and no command palette task
 * scheduled — only the settings entry point is wired (reuses the existing
 * LLM settings popover from Phase 0). The popover is anchored here (a
 * `position: relative` wrapper around this gear button) even though the
 * rail's bottom settings icon can also open it — both triggers share the
 * one `settingsOpen` state lifted to Shell. */
export default function TopBar({
  settingsOpen,
  settingsDisabled,
  onToggleSettings,
  onCloseSettings,
  onSettingsRestarted
}: {
  settingsOpen: boolean
  settingsDisabled: boolean
  onToggleSettings: () => void
  onCloseSettings: () => void
  onSettingsRestarted: () => void
}) {
  return (
    <header className="topbar" role="banner">
      <div className="topbar__mark" aria-hidden="true">
        A
      </div>
      <button
        type="button"
        className="topbar__btn"
        disabled
        title="Проект не открыт (задачи 1.3/1.4)"
      >
        <FilesIcon width={14} height={14} />
        <span>Проект не открыт</span>
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
