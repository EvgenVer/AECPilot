import { useEffect, useReducer, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Rail from './Rail'
import Sidebar from './Sidebar'
import CenterArea from './CenterArea'
import StatusBar from './StatusBar'
import TopBar from './TopBar'
import CreateProjectDialog from './CreateProjectDialog'
import ScanNotification from './ScanNotification'
import PanelResizer from './PanelResizer'
import {
  CHAT_MAX,
  CHAT_MIN,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  persistPanelSizes,
  readStoredPanelSizes,
  type PanelSizes
} from './panel-sizes-pure'
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
 * `currentProject` here to clear itself on a project switch. `ChatDock` is
 * scoped to the open project on the main-process side (task 1.20); this
 * shell just resets the visible transcript on every `project:opened` (a
 * project switch abandons the active session there) and forwards
 * `currentProject` so the session selector can show which project the chat
 * is in. */
export default function Shell() {
  const [activity, setActivity] = useState<ActivityId>('explorer')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatState, dispatch] = useReducer(chatReducer, initialChatState)
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>('closed')
  const [currentProject, setCurrentProject] = useState<OpenProject | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  // Task 1.5.9: resizable sidebar + chat dock, restored from localStorage.
  // `sizesRef` mirrors the state so the drag-end persist (PanelResizer's
  // onCommit) reads the width the last live `onResize` just set, without the
  // persist call itself becoming a side effect inside a setState updater.
  const [panelSizes, setPanelSizes] = useState<PanelSizes>(() =>
    readStoredPanelSizes(window.localStorage)
  )
  const sizesRef = useRef(panelSizes)
  function resizePanel(key: keyof PanelSizes, width: number): void {
    const next = { ...sizesRef.current, [key]: width }
    sizesRef.current = next
    setPanelSizes(next)
  }
  function persistPanels(): void {
    persistPanelSizes(window.localStorage, sizesRef.current)
  }

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
      // Task 1.20: a project switch abandons the active session on the main
      // side (main/index.ts's resetActiveSessionForProjectSwitch) — clear
      // the visible transcript to match, same reset chatState already gets
      // after a settings-triggered backend restart (TopBar's
      // onSettingsRestarted).
      dispatch({ kind: 'session-loaded', messages: [] })
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
      <div
        className="app-shell__body"
        style={
          {
            '--sidebar-w': `${panelSizes.sidebar}px`,
            '--chat-dock-w': `${panelSizes.chat}px`
          } as CSSProperties
        }
      >
        <Rail active={activity} onSelect={setActivity} onSettings={() => setSettingsOpen(true)} />
        <Sidebar active={activity} currentProject={currentProject} />
        <PanelResizer
          label="Изменить ширину боковой панели"
          width={panelSizes.sidebar}
          min={SIDEBAR_MIN}
          max={SIDEBAR_MAX}
          direction={1}
          onResize={(w) => resizePanel('sidebar', w)}
          onCommit={persistPanels}
        />
        <CenterArea active={activity} />
        <PanelResizer
          label="Изменить ширину панели чата"
          width={panelSizes.chat}
          min={CHAT_MIN}
          max={CHAT_MAX}
          direction={-1}
          onResize={(w) => resizePanel('chat', w)}
          onCommit={persistPanels}
        />
        <ChatDock
          state={chatState}
          dispatch={dispatch}
          connectionState={connectionState}
          currentProject={currentProject}
        />
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
