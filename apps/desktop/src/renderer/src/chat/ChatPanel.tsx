import { useEffect, useReducer, useState } from 'react'
import { chatReducer, initialChatState } from './chat-state'
import ToolCallCard from './ToolCallCard'
import ApprovalCard from './ApprovalCard'
import SessionMenu from './SessionMenu'
import SettingsPanel from './SettingsPanel'
import type { GatewayConnectionState } from '../../../shared/gateway/types'

const connectionLabel: Record<GatewayConnectionState, string> = {
  connecting: 'Connecting…',
  ready: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected'
}

export default function ChatPanel() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState)
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>('closed')
  const [draft, setDraft] = useState('')
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const awaitingApproval = state.approvals.length > 0
  const canSend =
    draft.trim().length > 0 && !state.streaming && connectionState === 'ready' && !awaitingApproval

  async function handleSend(): Promise<void> {
    const text = draft.trim()
    if (!text || state.streaming || connectionState !== 'ready') return
    setSubmitError(undefined)
    setDraft('')
    dispatch({ kind: 'user-submit', text })
    try {
      await window.aecpilot.submitPrompt(text)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #ddd',
          fontSize: 13
        }}
      >
        <span style={{ color: connectionState === 'ready' ? '#2a7' : '#a72' }}>
          {connectionLabel[connectionState]}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setSettingsOpen((open) => !open)}
              disabled={state.streaming || awaitingApproval}
              style={{
                font: 'inherit',
                fontSize: 12,
                padding: '4px 8px',
                cursor: state.streaming || awaitingApproval ? 'default' : 'pointer'
              }}
            >
              ⚙
            </button>
            {settingsOpen && (
              <SettingsPanel
                disabled={state.streaming || awaitingApproval}
                onClose={() => setSettingsOpen(false)}
                onRestarted={() => dispatch({ kind: 'session-loaded', messages: [] })}
              />
            )}
          </div>
          <SessionMenu
            disabled={state.streaming || awaitingApproval}
            currentLabel="Сессия"
            onSessionLoaded={(messages) => dispatch({ kind: 'session-loaded', messages })}
            onError={setSubmitError}
          />
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        {state.items.map((item, index) =>
          item.kind === 'tool' ? (
            <ToolCallCard key={item.toolId} call={item} />
          ) : (
            <div
              key={index}
              style={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '75%',
                padding: '8px 12px',
                borderRadius: 8,
                background: item.role === 'user' ? '#daf1ff' : '#f0f0f0',
                whiteSpace: 'pre-wrap'
              }}
            >
              {item.text}
              {item.status === 'error' && (
                <div style={{ color: '#c33', fontSize: 12, marginTop: 4 }}>error</div>
              )}
            </div>
          )
        )}
      </div>

      {submitError && (
        <div style={{ color: '#c33', fontSize: 12, padding: '0 12px' }}>{submitError}</div>
      )}

      {awaitingApproval && (
        <ApprovalCard
          request={state.approvals[0]}
          queueLength={state.approvals.length}
          onResolved={(resolved) => dispatch({ kind: 'approvals-resolved', count: resolved })}
        />
      )}

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #ddd' }}>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          disabled={awaitingApproval}
          style={{ flex: 1, padding: '8px 10px', fontSize: 14 }}
        />
        <button onClick={() => void handleSend()} disabled={!canSend}>
          Send
        </button>
      </div>
    </div>
  )
}
