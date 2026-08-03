import { useEffect, useReducer, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Rail from './Rail'
import SettingsScreen from './SettingsScreen'
import Sidebar from './Sidebar'
import CenterArea from './CenterArea'
import StatusBar from './StatusBar'
import TopBar from './TopBar'
import CommandPalette from './CommandPalette'
import CreateProjectDialog from './CreateProjectDialog'
import ScanNotification from './ScanNotification'
import Toasts from './Toasts'
import {
  emptyNotificationState,
  notificationFromEvent,
  notificationsReducer
} from './notifications-pure'
import PanelResizer from './PanelResizer'
import {
  PANEL_BOUNDS,
  persistPanelSizes,
  readStoredPanelSizes,
  type PanelSizes
} from './panel-sizes-pure'
import type { ActivityId } from './activities'
import ChatDock from '../chat/ChatDock'
import {
  chatReducer,
  initialChatState,
  isUnknownGatewayEvent,
  transcriptCensus
} from '../chat/chat-state'
import { isGatewayEventOfType, type GatewayConnectionState } from '../../../shared/gateway/types'
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
  // Notifications live beside the transcript, not inside it (task 1.6.B6.5):
  // a notice outlives the turn that raised it and must survive the
  // `session-loaded` reset that clears the chat.
  const [notifications, notificationsDispatch] = useReducer(
    notificationsReducer,
    emptyNotificationState
  )
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>('closed')
  const [currentProject, setCurrentProject] = useState<OpenProject | null>(null)
  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  // Task 1.5.9 (sidebar + chat dock) and batch L of Phase 1.6 (sources
  // section + bottom panel): every panel border is resizable, sizes restored
  // from localStorage. All four dimensions are owned here, in one record, so
  // the shell has a single writer for the storage key and one place that
  // renders their CSS vars. `sizesRef` mirrors the state so the drag-end
  // persist (PanelResizer's onCommit) reads the size the last live `onResize`
  // just set, without the persist call itself becoming a side effect inside a
  // setState updater.
  const [panelSizes, setPanelSizes] = useState<PanelSizes>(() =>
    readStoredPanelSizes(window.localStorage)
  )
  const sizesRef = useRef(panelSizes)
  function resizePanel(key: keyof PanelSizes, size: number): void {
    const next = { ...sizesRef.current, [key]: size }
    sizesRef.current = next
    setPanelSizes(next)
  }
  function persistPanels(): void {
    persistPanelSizes(window.localStorage, sizesRef.current)
  }

  // Task 1.6.2: after every change to the transcript, print what it HOLDS.
  // Read together with the event trace above, this answers the question the
  // owner's run could not: if the counts stay while the cards are gone from
  // the screen, nothing removed them — the view did.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const { messages, tools, reasoning } = transcriptCensus(chatState.items)
    console.debug(
      `[aecpilot] лента: сообщений ${messages}, инструментов ${tools}, рассуждений ${reasoning}`
    )
  }, [chatState.items])

  useEffect(() => {
    let mounted = true
    let gotLiveState = false
    const unsubscribeEvent = window.aecpilot.onChatEvent((event) => {
      // Task 1.5.D1 (D1.9): surface an event the chat does not act on, so a
      // hermes upgrade that adds one is noticed instead of silently dropped.
      // Dev-only, and the TYPE ONLY is ever logged — payloads carry user text
      // and, for secret.request, secrets (specs/agent-chat.md §Security).
      if (import.meta.env.DEV && isUnknownGatewayEvent(event.type)) {
        console.warn(`[aecpilot] gateway event not handled by the chat: ${event.type}`)
      }
      // Task 1.6.2: the event TRACE for the "карточки хода пропадают" defect.
      // Type plus the tool id only — never a payload, which carries user text
      // and, for secret.request, secrets (specs/agent-chat.md §Security). The
      // tool id is what tells "the same card was updated" from "a second card
      // was created", which is the whole question for a disappearing card.
      if (import.meta.env.DEV) {
        const toolId = (event as { payload?: { tool_id?: unknown } }).payload?.tool_id
        console.debug(
          `[aecpilot] evt ${event.type}${typeof toolId === 'string' ? ` #${toolId}` : ''}`
        )
      }
      // `receivedAt` (task 1.5.D1) times the reasoning block here, at the
      // edge, so the reducer itself never reads a clock and stays pure.
      const receivedAt = Date.now()
      dispatch({ kind: 'event', event, receivedAt })
      // Notifications (tasks 1.6.B6.4–B6.7, B6.10) come off the SAME event
      // stream but into their own queue — `notificationFromEvent` decides
      // which events are notices at all, and answers `undefined` for the rest.
      if (isGatewayEventOfType(event, 'notification.clear')) {
        const key = event.payload?.key
        if (typeof key === 'string' && key) notificationsDispatch({ kind: 'clear', key })
      } else {
        const notice = notificationFromEvent(event)
        if (notice) notificationsDispatch({ kind: 'show', input: notice, receivedAt })
      }
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
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        currentProject={currentProject}
        onOpenCreateProject={() => setCreateProjectOpen(true)}
      />
      {/* Task 1.6.B2.1: settings became a screen over the shell rather than a
          popover under the gear — batch 2 fills it with providers, tools, MCP
          servers and plugins, none of which fit a popover. */}
      {settingsOpen && (
        <SettingsScreen
          disabled={busy}
          onClose={() => setSettingsOpen(false)}
          onRestarted={() => dispatch({ kind: 'session-loaded', messages: [] })}
        />
      )}
      <div
        className="app-shell__body"
        style={
          {
            '--sidebar-w': `${panelSizes.sidebar}px`,
            '--chat-dock-w': `${panelSizes.chat}px`,
            '--sources-h': `${panelSizes.sources}px`,
            '--bottom-panel-h': `${panelSizes.bottom}px`
          } as CSSProperties
        }
      >
        <Rail active={activity} onSelect={setActivity} onSettings={() => setSettingsOpen(true)} />
        <Sidebar
          active={activity}
          currentProject={currentProject}
          sourcesHeight={panelSizes.sources}
          onResizeSources={(h) => resizePanel('sources', h)}
          onCommitSizes={persistPanels}
          chatStreaming={chatState.streaming}
          onSessionLoaded={(messages) => dispatch({ kind: 'session-loaded', messages })}
          onTurnUndone={(removed) => dispatch({ kind: 'turn-undone', removed })}
        />
        <PanelResizer
          label="Изменить ширину боковой панели"
          size={panelSizes.sidebar}
          min={PANEL_BOUNDS.sidebar.min}
          max={PANEL_BOUNDS.sidebar.max}
          defaultSize={PANEL_BOUNDS.sidebar.default}
          direction={1}
          onResize={(w) => resizePanel('sidebar', w)}
          onCommit={persistPanels}
        />
        <CenterArea
          active={activity}
          bottomHeight={panelSizes.bottom}
          onResizeBottom={(h) => resizePanel('bottom', h)}
          onCommitSizes={persistPanels}
        />
        <PanelResizer
          label="Изменить ширину панели чата"
          size={panelSizes.chat}
          min={PANEL_BOUNDS.chat.min}
          max={PANEL_BOUNDS.chat.max}
          defaultSize={PANEL_BOUNDS.chat.default}
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
        compacting={chatState.compacting}
        yolo={chatState.runtime.yolo}
        hasSession={chatState.runtimeKnown}
        notifications={notifications}
        notificationsDispatch={notificationsDispatch}
        onApprovalsError={() => {
          /* surfaced inline by ApprovalsModeSelect itself; nothing else to
           * do at the shell level for task 1.0. */
        }}
      />
      {createProjectOpen && <CreateProjectDialog onClose={() => setCreateProjectOpen(false)} />}
      {/* Task 1.6.B5.17: one global overlay, mounted always but rendering
          nothing until Ctrl+K — its only standing cost is one keydown
          listener. */}
      <CommandPalette
        onSelectActivity={setActivity}
        onSessionLoaded={(messages) => dispatch({ kind: 'session-loaded', messages })}
      />
      <ScanNotification currentProject={currentProject} />
      {/* Task 1.6.B6.6: the toast stack sits above the status bar; the queue
          behind it is shared with the status bar's counter and journal. */}
      <Toasts state={notifications} dispatch={notificationsDispatch} />
    </div>
  )
}
