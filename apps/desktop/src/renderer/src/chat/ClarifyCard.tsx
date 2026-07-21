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
 * card stays put rather than silently pretending it was delivered. */
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

  return (
    <div className="clarify-card">
      <div className="clarify-card__head">
        <span className="clarify-card__icon">
          <QuestionIcon />
        </span>
        <span className="clarify-card__title">Уточнение</span>
      </div>

      {request.question && <div className="clarify-card__question">{request.question}</div>}

      {hasChoices ? (
        <div className="clarify-card__choices">
          {request.choices.map((choice, index) => (
            <button
              key={`${index}:${choice}`}
              type="button"
              className="clarify-card__choice"
              disabled={pending}
              onClick={() => void respond(choice)}
            >
              <span className="clarify-card__radio" aria-hidden="true" />
              <span className="clarify-card__choice-label">{choice}</span>
            </button>
          ))}
        </div>
      ) : (
        // No preset options — the agent asked an open question, so it needs a
        // free-text answer rather than a dead card.
        <form
          className="clarify-card__form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!pending && draft.trim() !== '') void respond(draft.trim())
          }}
        >
          <input
            className="clarify-card__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ваш ответ…"
            disabled={pending}
            aria-label="Ответ на уточняющий вопрос"
          />
          <button
            type="submit"
            className="clarify-card__submit"
            disabled={pending || draft.trim() === ''}
          >
            Ответить
          </button>
        </form>
      )}

      {error && <div className="clarify-card__error">{error}</div>}
    </div>
  )
}
