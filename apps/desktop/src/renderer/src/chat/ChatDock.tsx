import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import type { ChatAction, ChatState } from './chat-state'
import ToolCallCard from './ToolCallCard'
import ReasoningCard from './ReasoningCard'
import ApprovalCard from './ApprovalCard'
import ClarifyCard from './ClarifyCard'
import SecretCard from './SecretCard'
import SudoCard from './SudoCard'
import SessionMenu from './SessionMenu'
import SubagentCard, { MoaCard } from './SubagentCard'
import ModelPicker from './ModelPicker'
import { MarkdownTextContent } from './vendor/hermes/markdown-text'
import {
  applySlashCompletion,
  enqueuePrompt,
  moveSelection,
  navigateHistory,
  rememberPrompt,
  removeQueued,
  takeNextQueued,
  slashQuery,
  type HistoryCursor,
  type QueuedPrompt
} from './composer-pure'
import { AttachIcon, SendIcon } from '../shell/icons'
import type { GatewayConnectionState, SlashCompletionItem } from '../../../shared/gateway/types'
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
  // Task 1.6.8. History is per-session-window state, not persisted — the same
  // scope their composer keeps it in.
  const [history, setHistory] = useState<string[]>([])
  const [historyCursor, setHistoryCursor] = useState<HistoryCursor>(undefined)
  const [stashedDraft, setStashedDraft] = useState('')
  const [queue, setQueue] = useState<QueuedPrompt[]>([])
  const [queueNextId, setQueueNextId] = useState(1)
  const [slashItems, setSlashItems] = useState<SlashCompletionItem[]>([])
  const [slashIndex, setSlashIndex] = useState(0)

  const awaitingApproval = state.approvals.length > 0
  // The oldest outstanding blocking request (task 1.5.D1). All three kinds
  // are answerable now, so the head of the queue is always what to show.
  const pendingInteractive = state.interactive[0]
  const busy = state.streaming || awaitingApproval
  const canSend = draft.trim().length > 0 && connectionState === 'ready'
  // Derived, not cleared: the moment the draft stops being a bare "/command"
  // the list is closed, with no state write to do it (and no synchronous
  // setState inside an effect, which the lint rules forbid for good reason).
  const slashOpen = slashQuery(draft) !== undefined && slashItems.length > 0

  /** Sends `text` for real. Everything that decides WHETHER to send (busy,
   * queued, blank) is settled by the callers. */
  const send = useCallback(
    async (text: string): Promise<void> => {
      setSubmitError(undefined)
      dispatch({ kind: 'user-submit', text })
      try {
        await window.aecpilot.submitPrompt(text)
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : String(error))
      }
    },
    [dispatch]
  )

  // Task 1.6.8: the queue drains itself the moment the agent is free again.
  // The pop happens on the next microtask, not in the effect body — a
  // synchronous setState there would cascade renders (`react-hooks/
  // set-state-in-effect`), and one microtask is invisible to the user.
  useEffect(() => {
    if (busy || connectionState !== 'ready' || queue.length === 0) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      const { next, queue: rest } = takeNextQueued(queue)
      if (!next) return
      setQueue(rest)
      void send(next.text)
    })
    return () => {
      cancelled = true
    }
  }, [busy, connectionState, queue, send])

  // Slash completions come from the gateway itself (`complete.slash`), so the
  // list is always the commands this build actually has — including skills.
  useEffect(() => {
    const query = slashQuery(draft)
    if (query === undefined) return
    let cancelled = false
    void window.aecpilot.completeSlash(query).then((result) => {
      if (cancelled) return
      setSlashItems(result.items)
      setSlashIndex(0)
    })
    return () => {
      cancelled = true
    }
  }, [draft])

  function resetHistoryWalk(): void {
    setHistoryCursor(undefined)
  }

  async function handleSend(): Promise<void> {
    const text = draft.trim()
    if (!text || connectionState !== 'ready') return
    setDraft('')
    resetHistoryWalk()
    setHistory((prev) => rememberPrompt(prev, text))
    // Busy is not a reason to lose what was typed: it goes to the queue and
    // leaves on its own (see the effect above).
    if (busy) {
      const { queue: next, nextId } = enqueuePrompt(queue, queueNextId, text)
      setQueue(next)
      setQueueNextId(nextId)
      return
    }
    await send(text)
  }

  function applyCompletion(item: SlashCompletionItem): void {
    setDraft(applySlashCompletion(item.text))
    setSlashItems([])
    textareaRef.current?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // An open completion list owns the arrows and Enter — history walking and
    // sending would both be wrong while a suggestion is highlighted.
    if (slashOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashIndex((index) =>
          moveSelection(slashItems.length, index, event.key === 'ArrowDown' ? 1 : -1)
        )
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = slashItems[slashIndex]
        if (item) {
          event.preventDefault()
          applyCompletion(item)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSlashItems([])
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
      return
    }

    // History: Up only from the very start of the text, Down only from the
    // very end — otherwise the arrows still move the caret inside a
    // multi-line draft, which is what a text area is for.
    const el = event.currentTarget
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length

    if (event.key === 'ArrowUp' && atStart) {
      const moved = navigateHistory(history, historyCursor, 'older', draft)
      if (!moved) return
      event.preventDefault()
      if (historyCursor === undefined) setStashedDraft(draft)
      setHistoryCursor(moved.cursor)
      setDraft(moved.text)
      return
    }

    if (event.key === 'ArrowDown' && atEnd) {
      const moved = navigateHistory(history, historyCursor, 'newer', stashedDraft)
      if (!moved) return
      event.preventDefault()
      setHistoryCursor(moved.cursor)
      setDraft(moved.text)
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
          ) : item.kind === 'subagent' ? (
            <SubagentCard key={`s${item.id}`} agent={item} />
          ) : item.kind === 'moa' ? (
            <MoaCard key={`m${item.id}`} moa={item} />
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
        {/* Task 1.6.8: what was typed while the agent was busy. Editable and
            removable right up until it leaves — a queued message is still the
            user's, not something already said. */}
        {queue.length > 0 && (
          <ul className="composer-queue" aria-label="Очередь сообщений">
            {queue.map((item) => (
              <li className="composer-queue__item" key={item.id}>
                <span className="composer-queue__text">{item.text}</span>
                <button
                  type="button"
                  className="composer-queue__btn"
                  title="Изменить"
                  onClick={() => {
                    setQueue(removeQueued(queue, item.id))
                    setDraft(item.text)
                    textareaRef.current?.focus()
                  }}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="composer-queue__btn"
                  title="Убрать из очереди"
                  aria-label={`Убрать из очереди: ${item.text}`}
                  onClick={() => setQueue(removeQueued(queue, item.id))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="composer">
          {slashOpen && (
            <ul className="composer-slash" aria-label="Команды">
              {slashItems.map((item, index) => (
                <li key={item.text}>
                  <button
                    type="button"
                    className={`composer-slash__item${
                      index === slashIndex ? ' composer-slash__item--active' : ''
                    }`}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => applyCompletion(item)}
                  >
                    <span className="composer-slash__name">{item.display}</span>
                    {item.meta && <span className="composer-slash__meta">{item.meta}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={textareaRef}
            className="composer__input"
            rows={1}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder="Спросите про проект…"
            // Task 1.6.8: typing is no longer blocked while the agent works —
            // what you write goes to the queue and leaves by itself. Blocking
            // the field was the thing that made a busy agent feel like a dead
            // one. Approvals still block: answering one is the way forward,
            // and queueing behind it would bury the question.
            disabled={awaitingApproval}
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
            {/* Task 1.6.9. Sits next to the send button because it changes what
                the next message will be answered BY — their model switch is
                refused mid-turn, so the control reports that instead of
                letting the click fail. */}
            <ModelPicker
              runtime={state.runtime}
              streaming={state.streaming}
              connected={connectionState === 'ready'}
            />
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
