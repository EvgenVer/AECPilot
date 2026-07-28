import { useRef, useState } from 'react'
import type { Dispatch } from 'react'
import type { ChatAction, ChatState } from './chat-state'
import ToolCallCard from './ToolCallCard'
import ReasoningCard from './ReasoningCard'
import ApprovalCard from './ApprovalCard'
import ClarifyCard from './ClarifyCard'
import SecretCard from './SecretCard'
import SudoCard from './SudoCard'
import SessionMenu from './SessionMenu'
import { MarkdownTextContent } from './vendor/hermes/markdown-text'
import { AttachIcon, SendIcon } from '../shell/icons'
import type { GatewayConnectionState } from '../../../shared/gateway/types'
import type { OpenProject } from '../../../shared/ipc'

/** Right-hand chat dock (task 1.0): the Phase 0 chat panel (0.11–0.17),
 * restyled to sit in the workspace shell's chat dock region per
 * design/screens/Shell.html — reducer/IPC calls are unchanged, only the
 * layout/markup moved. Connection state (no dot here — see StatusBar.tsx)
 * and the approvals-mode indicator now live in the shell's status bar; the
 * LLM settings popover moved to the top bar (TopBar.tsx) — this dock keeps
 * only the session selector, transcript and composer. `currentProject` (task
 * 1.20) only drives the session selector's label — the chat is scoped to it
 * on the main-process side (main/index.ts, session-projects.ts). */
export default function ChatDock({
  state,
  dispatch,
  connectionState,
  currentProject
}: {
  state: ChatState
  dispatch: Dispatch<ChatAction>
  connectionState: GatewayConnectionState
  currentProject: OpenProject | null
}) {
  const [draft, setDraft] = useState('')
  const [submitError, setSubmitError] = useState<string | undefined>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const awaitingApproval = state.approvals.length > 0
  // The oldest outstanding blocking request (task 1.5.D1). All three kinds
  // are answerable now, so the head of the queue is always what to show.
  const pendingInteractive = state.interactive[0]
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  function handleDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    setDraft(event.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 132)}px`
    }
  }

  return (
    <div className="chat-dock">
      <div className="chat-dock__header">
        <SessionMenu
          disabled={state.streaming || awaitingApproval}
          currentLabel={currentProject ? currentProject.name : 'Сессия'}
          onSessionLoaded={(messages) => dispatch({ kind: 'session-loaded', messages })}
          onError={setSubmitError}
        />
      </div>

      <div className="chat-dock__feed">
        {state.items.map((item) =>
          item.kind === 'tool' ? (
            <ToolCallCard key={item.toolId} call={item} />
          ) : item.kind === 'reasoning' ? (
            <ReasoningCard key={`r${item.id}`} block={item} />
          ) : (
            <div
              key={item.id}
              className={
                item.role === 'user' ? 'message message--user' : 'message message--assistant'
              }
            >
              {item.role === 'assistant' ? (
                <MarkdownTextContent text={item.text} isRunning={item.status === 'streaming'} />
              ) : (
                item.text
              )}
              {item.status === 'error' && <div className="message__error">ошибка</div>}
            </div>
          )
        )}
      </div>

      {submitError && <div className="chat-dock__error">{submitError}</div>}

      {awaitingApproval && (
        <ApprovalCard
          request={state.approvals[0]}
          queueLength={state.approvals.length}
          onResolved={(resolved) => dispatch({ kind: 'approvals-resolved', count: resolved })}
        />
      )}

      {/* Task 1.5.D1: blocking agent requests, pinned here (not in the feed)
          because the agent core is stopped until answered and the feed does
          not auto-scroll — a transcript card could scroll out of sight. */}
      {/* `key` is the request id on purpose (security review of D1.8): it
          forces a FRESH component — and therefore empty input state — for
          every request. Without it React would reuse the instance when one
          request replaces another at the head of the queue, and a value typed
          for one request could be submitted against a different one. That is
          not reachable today (a request only leaves the head via our own
          resolve, which clears first), but on a secret path the guarantee
          should be structural rather than dependent on a cleanup call. */}
      {pendingInteractive?.kind === 'clarify' && (
        <ClarifyCard
          key={pendingInteractive.requestId}
          request={pendingInteractive}
          onResolved={(requestId) => dispatch({ kind: 'interactive-resolved', requestId })}
        />
      )}
      {pendingInteractive?.kind === 'secret' && (
        <SecretCard
          key={pendingInteractive.requestId}
          request={pendingInteractive}
          onResolved={(requestId) => dispatch({ kind: 'interactive-resolved', requestId })}
        />
      )}
      {pendingInteractive?.kind === 'sudo' && (
        <SudoCard
          key={pendingInteractive.requestId}
          request={pendingInteractive}
          onResolved={(requestId) => dispatch({ kind: 'interactive-resolved', requestId })}
        />
      )}

      <div className="chat-dock__composer">
        <div className="composer">
          <textarea
            ref={textareaRef}
            className="composer__input"
            rows={1}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Спросите про проект…"
            // Disabled while awaiting an approval or mid-stream (Phase 0
            // behavior — sending was already blocked, now so is typing).
            // Deliberately NOT disabled on connectionState !== 'ready': the
            // user can keep drafting while the gateway reconnects.
            disabled={awaitingApproval || state.streaming}
          />
          <div className="composer__row">
            <button
              type="button"
              className="composer__icon-btn"
              disabled
              title="Вложения — Phase 2+"
              aria-label="Прикрепить файл"
            >
              <AttachIcon width={16} height={16} />
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className="composer__send"
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Отправить"
            >
              <SendIcon width={16} height={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
