import { useEffect, useReducer, useState } from 'react'
import Rail from './Rail'
import Sidebar from './Sidebar'
import CenterArea from './CenterArea'
import StatusBar from './StatusBar'
import TopBar from './TopBar'
import CreateProjectDialog from './CreateProjectDialog'
import ScanNotification from './ScanNotification'
import type { ActivityId } from './activities'
import ChatDock from '../chat/ChatDock'
import { chatReducer, initialChatState } from '../chat/chat-state'
import type { GatewayConnectionState } from '../../../shared/gateway/types'
import type { OpenProject } from '../../../shared/ipc'

/** Workspace shell (task 1.0): rail + contextual sidebar + center + chat
 * dock + status bar + bottom panel, per design/DESIGN_BRIEF.md §3. The chat
 * dock carries over all of Phase 0's chat functionality unchanged (reducer,
 * IPC) — this component only owns shell-level UI state (active activity,
 * settings popover, connection state for the status bar, current project /
 * create-project modal — task 1.3). `ScanNotification` (task 1.15) is
 * self-contained — it subscribes to scan reports itself, so it only needs
 * `currentProject` here to clear itself on a project switch. */
export default function Shell() {
  const [activity, setActivity] = useState<ActivityId>('explorer')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatState, dispatch] = useReducer(chatReducer, initialChatState)
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>('closed')
  const [currentProject, setCurrentProject] = useState<OpenProject | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    let gotLiveState = false
    const unsubscribeEvent = window.aecpilot.onChatEvent((event) => {
      dispatch({ kind: 'event', event })
    })
    const unsubscribeState = window.aecpilot.onGatewayState((s) => {
      gotLiveState = true
      setConnectionState(s)
    })
    // The gateway can reach 'ready' before this window/renderer exists to
    // receive the push (main connects it before creating the window), so pull
    // the current state once on mount. A live event always wins over this
    // hydration snapshot.
    void window.aecpilot.getGatewayState().then((s) => {
      if (mounted && !gotLiveState) setConnectionState(s)
    })
    return () => {
      mounted = false
      unsubscribeEvent()
      unsubscribeState()
    }
  }, [])

  useEffect(() => {
    let mounted = true
    void window.aecpilot.getCurrentProject().then((project) => {
      if (mounted) setCurrentProject(project)
    })
    const unsubscribe = window.aecpilot.onProjectOpened((project) => {
      setCurrentProject(project)
      setCreateProjectOpen(false)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const awaitingApproval = chatState.approvals.length > 0
  const busy = chatState.streaming || awaitingApproval

  return (
    <div className="app-shell">
      <TopBar
        settingsOpen={settingsOpen}
        settingsDisabled={busy}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onCloseSettings={() => setSettingsOpen(false)}
        onSettingsRestarted={() => dispatch({ kind: 'session-loaded', messages: [] })}
        currentProject={currentProject}
        onOpenCreateProject={() => setCreateProjectOpen(true)}
      />
      <div className="app-shell__body">
        <Rail active={activity} onSelect={setActivity} onSettings={() => setSettingsOpen(true)} />
        <Sidebar active={activity} currentProject={currentProject} />
        <CenterArea active={activity} />
        <ChatDock state={chatState} dispatch={dispatch} connectionState={connectionState} />
      </div>
      <StatusBar
        connectionState={connectionState}
        approvalsDisabled={busy}
        onApprovalsError={() => {
          /* surfaced inline by ApprovalsModeSelect itself; nothing else to
           * do at the shell level for task 1.0. */
        }}
      />
      {createProjectOpen && <CreateProjectDialog onClose={() => setCreateProjectOpen(false)} />}
      <ScanNotification currentProject={currentProject} />
    </div>
  )
}
