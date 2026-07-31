import { useEffect, useState } from 'react'
import { ScanIcon, SearchIcon, SettingsIcon } from './icons'
import ProjectMenu from './ProjectMenu'
import type { OpenProject } from '../../../shared/ipc'

/** Top bar (task 1.0): app identity + inert placeholders matching the
 * approved shell layout (design/DESIGN_BRIEF.md §3). The project button
 * opens `ProjectMenu` (task 1.4: open existing / create / recents), whether
 * or not a project is currently open — switching mid-session just replaces
 * `currentProject` in main. The command palette trigger stays visual-only —
 * no command palette task scheduled. "Сканировать" (task 1.14) is live:
 * hydrates its "идёт сканирование" indicator from `getScanState` on mount
 * (a scan can already be in flight from the interval schedule before this
 * mounts) and subscribes to `onScanState` for updates; clicking it fires
 * `triggerScan` ("сканировать сейчас" — a no-op if a scan is already
 * running). The change list itself (task 1.15) is not this task's job — this
 * button only surfaces that a scan is happening, via its own disabled state
 * and label. The settings entry point reuses the existing LLM settings
 * popover from Phase 0, anchored here (a `position: relative` wrapper around
 * this gear button) even though the rail's bottom settings icon can also
 * open it — both triggers share the one `settingsOpen` state lifted to
 * Shell. Task 1.6.B2.1: the settings surface itself is no longer anchored
 * here — it became a screen (`SettingsScreen`, rendered by Shell), so this
 * button only toggles it. */
export default function TopBar({
  settingsOpen,
  onToggleSettings,
  currentProject,
  onOpenCreateProject
}: {
  settingsOpen: boolean
  onToggleSettings: () => void
  currentProject: OpenProject | null
  onOpenCreateProject: () => void
}) {
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    let mounted = true
    void window.aecpilot.getScanState().then((state) => {
      if (mounted) setScanning(state.scanning)
    })
    const unsubscribe = window.aecpilot.onScanState((s) => setScanning(s))
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return (
    <header className="topbar" role="banner">
      <div className="topbar__mark" aria-hidden="true">
        A
      </div>
      <ProjectMenu currentProject={currentProject} onOpenCreateProject={onOpenCreateProject} />

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
        disabled={!currentProject || scanning}
        title={scanning ? 'Идёт сканирование источников…' : 'Сканировать источники сейчас'}
        onClick={() => void window.aecpilot.triggerScan()}
      >
        <ScanIcon width={14} height={14} />
        {scanning ? 'Сканирование…' : 'Сканировать'}
      </button>

      <div className="topbar__spacer" />

      <button
        type="button"
        className="topbar__icon-btn"
        title="Настройки"
        aria-label="Настройки"
        aria-expanded={settingsOpen}
        onClick={onToggleSettings}
      >
        <SettingsIcon width={16} height={16} />
      </button>
    </header>
  )
}
