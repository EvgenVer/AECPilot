import { useEffect, useReducer, useState } from 'react'
import Rail from './Rail'
import Sidebar from './Sidebar'
import CenterArea from './CenterArea'
import StatusBar from './StatusBar'
import TopBar from './TopBar'
import type { ActivityId } from './activities'
import ChatDock from '../chat/ChatDock'
import { chatReducer, initialChatState } from '../chat/chat-state'
import type { GatewayConnectionState } from '../../../shared/gateway/types'

/** Workspace shell (task 1.0): rail + contextual sidebar + center + chat
 * dock + status bar + bottom panel, per design/DESIGN_BRIEF.md §3. The chat
 * dock carries over all of Phase 0's chat functionality unchanged (reducer,
 * IPC) — this component only owns shell-level UI state (active activity,
 * settings popover, connection state for the status bar). */
export default function Shell() {
  const [activity, setActivity] = useState<ActivityId>('explorer')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatState, dispatch] = useReducer(chatReducer, initialChatState)
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>('closed')

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
      />
      <div className="app-shell__body">
        <Rail active={activity} onSelect={setActivity} onSettings={() => setSettingsOpen(true)} />
        <Sidebar active={activity} />
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
    </div>
  )
}
