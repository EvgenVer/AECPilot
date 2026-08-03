import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import type { ChatAction, ChatState } from './chat-state'
import { userOrdinalOf } from './chat-state'
import ToolCallCard from './ToolCallCard'
import ReasoningCard from './ReasoningCard'
import ApprovalCard from './ApprovalCard'
import ClarifyCard from './ClarifyCard'
import SecretCard from './SecretCard'
import SudoCard from './SudoCard'
import SessionMenu from './SessionMenu'
import SubagentCard, { MoaCard } from './SubagentCard'
import ModelPicker from './ModelPicker'
import GoalBadge from './GoalBadge'
import { MarkdownTextContent } from './vendor/hermes/markdown-text'
import {
  applyReferenceCompletion,
  applySlashCompletion,
  describeSteerOutcome,
  describeSubmitOutcome,
  isSteerUnsupported,
  referenceQuery,
  moveSelection,
  navigateHistory,
  rememberPrompt,
  slashQuery,
  type HistoryCursor
} from './composer-pure'
import { AttachIcon, SendIcon } from '../shell/icons'
import type { GatewayConnectionState, SlashCompletionItem } from '../../../shared/gateway/types'
import type { AttachmentOutcome, OpenProject } from '../../../shared/ipc'
import {
  attachmentErrorMessage,
  attachmentLabel,
  attachmentSummary
} from '../../../shared/attachments'

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
  // Task 1.6.B5.26/B5.16: what the gateway did with the last message
  // ("queued"/"steered") and what steering answered. Both are transient
  // acknowledgements, not errors — see `describeSubmitOutcome`.
  const [sendNotice, setSendNotice] = useState<string | undefined>(undefined)
  // Their 4010 says this agent has no `steer` at all, which will not change
  // for the life of the session — so the control retires instead of failing on
  // every press.
  const [steerUnsupported, setSteerUnsupported] = useState(false)
  // Task 1.6.B5.27: which of the user's own messages is being rewritten, by
  // its USER-TURN ordinal — the number their `truncate_before_user_ordinal`
  // counts, not a transcript index.
  const [editing, setEditing] = useState<number | undefined>(undefined)
  const [slashItems, setSlashItems] = useState<SlashCompletionItem[]>([])
  const [slashIndex, setSlashIndex] = useState(0)
  // Task 1.6.A3. Which of the two completion sources the current list came
  // from — the two share one popup and one keyboard, but insert differently.
  const [completionKind, setCompletionKind] = useState<'slash' | 'reference'>('slash')
  // An `@`-reference can sit anywhere in the text, so unlike a slash command
  // it cannot be located from the draft alone; the caret is what says which
  // token is being typed.
  const [caret, setCaret] = useState(0)
  // Task 1.6.A4. Paths only — the gateway session owns the real list, this is
  // what to draw and what to detach by.
  const [attachments, setAttachments] = useState<string[]>([])
  const [attachError, setAttachError] = useState<string | undefined>(undefined)

  const awaitingApproval = state.approvals.length > 0
  // The oldest outstanding blocking request (task 1.5.D1). All three kinds
  // are answerable now, so the head of the queue is always what to show.
  const pendingInteractive = state.interactive[0]
  const canSend = draft.trim().length > 0 && connectionState === 'ready'
  // Derived, not cleared: the moment the draft stops being a bare "/command"
  // (or an `@`-reference) the list is closed, with no state write to do it
  // (and no synchronous setState inside an effect, which the lint rules forbid
  // for good reason).
  const refRange = referenceQuery(draft, caret)
  const slashOpen =
    slashItems.length > 0 &&
    (completionKind === 'slash' ? slashQuery(draft) !== undefined : refRange !== undefined)

  /** Sends `text` for real. Everything that decides WHETHER to send (busy,
   * queued, blank) is settled by the callers. */
  const send = useCallback(
    async (text: string): Promise<void> => {
      setSubmitError(undefined)
      setSendNotice(undefined)
      // Task 1.6.A4: their `prompt.submit` folds the session's attachments
      // into this message and empties the list, so the chips go here, at the
      // actual send.
      setAttachments([])
      setAttachError(undefined)
      dispatch({ kind: 'user-submit', text })
      try {
        const result = await window.aecpilot.submitPrompt(text)
        // Task 1.6.B5.26: `queued` and `steered` are acceptances, not
        // failures — the core applied the user's own busy-input policy. Saying
        // nothing about them would leave a message looking lost.
        setSendNotice(describeSubmitOutcome(result?.status))
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : String(error))
      }
    },
    [dispatch]
  )

  // Both completion lists come from the gateway itself (`complete.slash`,
  // `complete.path`), so they always describe this build and this project —
  // the commands it actually has, the files that actually exist.
  useEffect(() => {
    const slash = slashQuery(draft)
    const reference = referenceQuery(draft, caret)
    // A slash command wins: it can only occur at position 0, so the two never
    // genuinely compete except on "/что-то @…", where the command is the
    // thing being completed only while there is no space — and by then
    // `slashQuery` has already given up.
    const source =
      slash !== undefined
        ? { kind: 'slash' as const, fetch: () => window.aecpilot.completeSlash(slash) }
        : reference !== undefined
          ? {
              kind: 'reference' as const,
              fetch: () => window.aecpilot.completePath(reference.word)
            }
          : undefined
    if (!source) return
    let cancelled = false
    void source.fetch().then((result) => {
      if (cancelled) return
      setCompletionKind(source.kind)
      setSlashItems(result.items)
      setSlashIndex(0)
    })
    return () => {
      cancelled = true
    }
  }, [draft, caret])

  // --- Attachments (task 1.6.A4) -------------------------------------------
  // Their `prompt.submit` folds the session's attachments into the message and
  // clears them, so the chips clear on send too — leaving them would claim the
  // next message carries files it does not.
  function absorbOutcomes(outcomes: AttachmentOutcome[]): void {
    const failed = outcomes.filter((o) => !o.ok)
    setAttachError(
      failed.length === 0
        ? undefined
        : attachmentErrorMessage(failed.map((o) => (o.ok ? '' : o.error)).join('; '))
    )
    const added = outcomes.flatMap((o) => (o.ok && o.path ? [o.path] : []))
    if (added.length > 0) setAttachments((prev) => [...prev, ...added])
  }

  async function handleAttach(): Promise<void> {
    absorbOutcomes(await window.aecpilot.pickAttachments())
  }

  async function handlePasteAttachment(): Promise<boolean> {
    const outcome = await window.aecpilot.pasteAttachment()
    // A paste with no image in the clipboard is not an error worth showing —
    // it is the ordinary case of pasting text, which the textarea handles.
    if (!outcome.ok) return false
    absorbOutcomes([outcome])
    return true
  }

  async function handleDetach(path: string): Promise<void> {
    await window.aecpilot.detachAttachment(path)
    setAttachments((prev) => prev.filter((p) => p !== path))
  }

  function resetHistoryWalk(): void {
    setHistoryCursor(undefined)
  }

  /** Re-runs the conversation from an edited message (task 1.6.B5.27).
   *
   * The transcript is trimmed only AFTER the gateway accepts: their handler
   * rejects an out-of-range ordinal with 4018 — deliberately, because Python's
   * negative indexing would otherwise truncate the session to its last turn —
   * and a transcript cut before that answer would be showing a truncation that
   * did not happen. */
  async function handleResubmit(ordinal: number, text: string): Promise<void> {
    setSubmitError(undefined)
    setSendNotice(undefined)
    try {
      await window.aecpilot.submitPrompt(text, ordinal)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error))
      return
    }
    setEditing(undefined)
    setDraft('')
    dispatch({ kind: 'user-resubmit', ordinal, text })
  }

  async function handleSend(): Promise<void> {
    const text = draft.trim()
    if (!text || connectionState !== 'ready') return
    if (editing !== undefined) {
      await handleResubmit(editing, text)
      return
    }
    setDraft('')
    resetHistoryWalk()
    setHistory((prev) => rememberPrompt(prev, text))
    // Task 1.6.B5.26: no branch on `busy` any more. Since hermes 0.19.0 the
    // gateway itself decides what a mid-turn message does — queue it, steer it
    // into the running turn, or interrupt — according to
    // `display.busy_input_mode`, which the user sets in "Поведение агента".
    // Deciding it here as well would mean two mechanisms racing to own the
    // same message.
    await send(text)
  }

  /** Task 1.6.B5.16: a note for the RUNNING turn, deliberately separate from
   * sending. It lands on the next tool result and never becomes a user turn,
   * which is exactly what makes it useful mid-answer — and why it is offered
   * only while the agent is streaming. */
  async function handleSteer(): Promise<void> {
    const text = draft.trim()
    if (!text || !state.streaming || steerUnsupported) return
    setSubmitError(undefined)
    try {
      const result = await window.aecpilot.steerSession(text)
      setDraft('')
      resetHistoryWalk()
      setSendNotice(describeSteerOutcome(result?.status))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isSteerUnsupported(message)) {
        setSteerUnsupported(true)
        setSendNotice('Этот агент не умеет принимать подсказки на ходу.')
        return
      }
      setSubmitError(message)
    }
  }

  function applyCompletion(item: SlashCompletionItem): void {
    if (completionKind === 'reference' && refRange) {
      const { text, caret: nextCaret } = applyReferenceCompletion(draft, refRange, item.text)
      setDraft(text)
      setCaret(nextCaret)
      setSlashItems([])
      // The caret must land inside the reference that was just inserted, not
      // at the end of the whole draft — a reference edited mid-sentence would
      // otherwise throw the user to the end of it.
      const el = textareaRef.current
      el?.focus()
      requestAnimationFrame(() => el?.setSelectionRange(nextCaret, nextCaret))
      return
    }
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
    setCaret(event.target.selectionStart)
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
          ) : item.kind === 'notice' ? (
            // The agent changed itself (task 1.6.B3.12). Stays in the
            // transcript — a toast would expire and leave no way back to it.
            <div key={`n${item.id}`} className="chat-notice" role="status">
              <span className="chat-notice__glyph" aria-hidden="true">
                💾
              </span>
              {item.text}
            </div>
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
              {/* Task 1.6.B5.27: rewriting a question and running the
                  conversation again from there. Offered only outside a turn —
                  their handler rewrites the session's history, which is not a
                  thing to do while the agent is reading it. */}
              {item.role === 'user' && !state.streaming && (
                <button
                  type="button"
                  className="message__edit"
                  title="Изменить это сообщение и переспросить"
                  onClick={() => {
                    const ordinal = userOrdinalOf(state.items, item.id)
                    if (ordinal === undefined) return
                    setEditing(ordinal)
                    setDraft(item.text)
                    textareaRef.current?.focus()
                  }}
                >
                  Изменить
                </button>
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
        {/* Task 1.6.A5: why the agent keeps taking turns nobody typed. */}
        <GoalBadge />

        {/* Task 1.6.A4: what will travel with the next message. */}
        {attachments.length > 0 && (
          <ul className="composer-attachments" aria-label="Вложения">
            {attachments.map((path) => (
              <li className="composer-attachments__item" key={path}>
                <span className="composer-attachments__name" title={path}>
                  {attachmentLabel(path)}
                </span>
                <button
                  type="button"
                  className="composer-attachments__btn"
                  aria-label={`Убрать вложение: ${attachmentLabel(path)}`}
                  onClick={() => void handleDetach(path)}
                >
                  ✕
                </button>
              </li>
            ))}
            <li className="composer-attachments__summary">
              {attachmentSummary(attachments.length)}
            </li>
          </ul>
        )}
        {attachError && <p className="composer-attachments__error">{attachError}</p>}

        {/* Task 1.6.B5.26: what the gateway did with the message. The queue
            that used to be drawn here belonged to a protocol that no longer
            exists — the core holds the message now, and this says so. */}
        {sendNotice && (
          <p className="composer-notice" role="status">
            {sendNotice}
          </p>
        )}

        {editing !== undefined && (
          <p className="composer-notice" role="status">
            Правка сообщения: всё, что было после него, будет отброшено и ход пойдёт заново.{' '}
            <button
              type="button"
              className="composer-notice__cancel"
              onClick={() => {
                setEditing(undefined)
                setDraft('')
              }}
            >
              Отменить правку
            </button>
          </p>
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
            // Task 1.6.A3: moving the caret with the mouse or the arrows
            // changes which `@`-reference is being typed, without changing a
            // character of the draft.
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            // Task 1.6.A4: an image in the clipboard becomes an attachment;
            // anything else falls through to the textarea's own paste, which
            // is why the default is only prevented once an image is confirmed
            // to have been taken.
            onPaste={(event) => {
              if (!Array.from(event.clipboardData.items).some((i) => i.type.startsWith('image/')))
                return
              event.preventDefault()
              void handlePasteAttachment()
            }}
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
              onClick={() => void handleAttach()}
              title="Прикрепить картинку или PDF"
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
            {/* Task 1.6.B5.16. Only while a turn is running: outside one there
                is nothing to steer, and their handler would answer 4002. */}
            {state.streaming && !steerUnsupported && (
              <button
                type="button"
                className="composer__steer"
                onClick={() => void handleSteer()}
                disabled={draft.trim().length === 0 || connectionState !== 'ready'}
                title="Подсказать агенту, не прерывая ход"
              >
                Подрулить
              </button>
            )}
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
