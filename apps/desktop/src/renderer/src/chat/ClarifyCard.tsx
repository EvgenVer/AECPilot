import { useState } from 'react'
import type { InteractiveRequest } from './chat-state'

type ClarifyRequest = Extract<InteractiveRequest, { kind: 'clarify' }>

function QuestionIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </svg>
  )
}

/** The agent's clarifying question (task 1.5.D1), per design
 * design/screens/Chat.html §5.9.
 *
 * This is a BLOCKING request: the agent core is stopped until it is answered
 * (300 s, then it gives up with an empty answer), which is why it is pinned
 * above the composer next to `ApprovalCard` rather than dropped into the
 * transcript — the feed does not auto-scroll and could hide it.
 *
 * The gateway matches the reply by `request_id` and answers 4009 once that
 * request is gone (typically it timed out), so a failure is surfaced and the
 * card stays put rather than silently pretending it was delivered.
 *
 * Parity pass 1.6.12 (their `clarify-tool.tsx`):
 * the offered options never trap the user — a free-text answer is available
 * next to them, picking an option selects rather than sends, and "Пропустить"
 * sends the empty answer their core treats as "no preference". */
export default function ClarifyCard({
  request,
  onResolved
}: {
  request: ClarifyRequest
  onResolved: (requestId: string) => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [selected, setSelected] = useState<string | undefined>(undefined)

  async function respond(answer: string): Promise<void> {
    setPending(true)
    setError(undefined)
    try {
      await window.aecpilot.respondClarify(request.requestId, answer)
      onResolved(request.requestId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPending(false)
    }
  }

  const hasChoices = request.choices.length > 0
  // Picking an option and typing are mutually exclusive answers — whichever
  // the user touched last is the one that will be sent.
  const answer = selected ?? (draft.trim() || undefined)

  return (
    <div className="clarify-card">
      <div className="clarify-card__head">
        <span className="clarify-card__icon">
          <QuestionIcon />
        </span>
        <span className="clarify-card__title">Уточнение</span>
      </div>

      {request.question && <div className="clarify-card__question">{request.question}</div>}

      {hasChoices && (
        <div className="clarify-card__choices" role="group">
          {request.choices.map((choice, index) => (
            <button
              key={`${index}:${choice}`}
              type="button"
              className={
                selected === choice
                  ? 'clarify-card__choice clarify-card__choice--selected'
                  : 'clarify-card__choice'
              }
              aria-pressed={selected === choice}
              disabled={pending}
              onClick={() => {
                setDraft('')
                setSelected(choice)
              }}
            >
              <span className="clarify-card__radio" aria-hidden="true" />
              <span className="clarify-card__choice-label">{choice}</span>
            </button>
          ))}
        </div>
      )}

      <form
        className="clarify-card__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pending && answer !== undefined) void respond(answer)
        }}
      >
        <input
          className="clarify-card__input"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            if (e.target.value.trim() !== '') setSelected(undefined)
          }}
          placeholder={hasChoices ? 'Другой ответ…' : 'Ваш ответ…'}
          disabled={pending}
          aria-label="Ответ на уточняющий вопрос"
        />
        <button type="submit" className="clarify-card__submit" disabled={pending || !answer}>
          Ответить
        </button>
        {/* Empty answer: their core documents it as a legitimate "no
            preference" (the same thing a timeout sends), so the agent resumes
            instead of standing still for 300 s. */}
        <button
          type="button"
          className="clarify-card__skip"
          disabled={pending}
          onClick={() => void respond('')}
        >
          Пропустить
        </button>
      </form>

      {error && <div className="clarify-card__error">{error}</div>}
    </div>
  )
}
