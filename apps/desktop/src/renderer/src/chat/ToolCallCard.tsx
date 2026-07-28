import { useState } from 'react'
import type { ChatToolCall } from './chat-state'
import { hasToolDetails, toolDisplayName } from './tool-label-pure'
import { formatElapsed, useElapsedSeconds } from './vendor/hermes/activity-timer'

const RESULT_PREVIEW_LIMIT = 4000

/** Spinner arc — shown while the call is in flight (design §5.9). */
function RunningIcon() {
  return (
    <svg
      className="tool-card__spinner"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  )
}

/** Settled tool glyph — a dialed knob, per design §5.9's finished card. */
function ToolIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={open ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
    </svg>
  )
}

/** One agent tool call (task 1.5.D1 redesign, per design/screens/Chat.html
 * §5.9). Full-width like the other transcript cards; a spinner + «выполняется…»
 * while running, a check + duration once settled, and args/result behind the
 * chevron.
 *
 * The name always comes through `toolDisplayName`, which cannot return an
 * empty string — that is the standing guarantee closing task 1.5.2, so no
 * upstream payload shape can produce an unlabeled empty card. The chevron
 * only appears when there is something to expand. */
export default function ToolCallCard({ call }: { call: ChatToolCall }) {
  const [expanded, setExpanded] = useState(false)
  const [showFullResult, setShowFullResult] = useState(false)

  const label = toolDisplayName(call.name)
  const running = call.status === 'running'
  const expandable = hasToolDetails(call)
  // Task 1.6.7, taken from their card: a running tool counts seconds out loud.
  // A silent «выполняется…» is exactly the "агент молча простаивает" complaint
  // — a moving number is the difference between "работает" and "завис". Keyed
  // by the call id so the count survives the card remounting.
  const elapsed = useElapsedSeconds(running, call.toolId)

  const result = call.result ?? ''
  const resultIsTruncated = result.length > RESULT_PREVIEW_LIMIT
  const displayedResult =
    showFullResult || !resultIsTruncated ? result : result.slice(0, RESULT_PREVIEW_LIMIT)

  const head = (
    <>
      <span className={`tool-card__icon${running ? ' tool-card__icon--running' : ''}`}>
        {running ? <RunningIcon /> : <ToolIcon />}
      </span>
      <span className="tool-card__name" title={label}>
        {label}
      </span>
      <span className="tool-card__context" title={call.context || undefined}>
        {call.context}
      </span>
      {running ? (
        <span className="tool-card__status tool-card__status--running">
          выполняется… {formatElapsed(elapsed)}
        </span>
      ) : (
        <span className="tool-card__status tool-card__status--ok">
          <CheckIcon />
          {call.durationS !== undefined ? `${call.durationS.toFixed(1)}s` : 'ok'}
        </span>
      )}
      {expandable && (
        <span className="tool-card__chevron">
          <ChevronIcon open={expanded} />
        </span>
      )}
    </>
  )

  return (
    <div className="tool-card">
      {expandable ? (
        <button
          type="button"
          className="tool-card__head"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {head}
        </button>
      ) : (
        // Nothing to expand — render a plain row so it is not a button that
        // pretends to do something.
        <div className="tool-card__head tool-card__head--static">{head}</div>
      )}

      {expanded && expandable && (
        // Task 1.6.7: args and result are LABELLED sections, the way their
        // `DisclosureRow` splits them — an unlabeled pair of blobs left the
        // reader guessing which half was the call and which the answer.
        <div className="tool-card__body">
          {call.args !== undefined && (
            <section className="tool-card__section">
              <h4 className="tool-card__section-title">Аргументы</h4>
              <pre className="tool-card__pre">{JSON.stringify(call.args, null, 2)}</pre>
            </section>
          )}
          {call.result !== undefined && (
            <section className="tool-card__section">
              <h4 className="tool-card__section-title">Результат</h4>
              <pre className="tool-card__pre">
                {displayedResult}
                {!showFullResult && resultIsTruncated && '…'}
              </pre>
              {resultIsTruncated && (
                <button
                  type="button"
                  className="tool-card__more"
                  onClick={() => setShowFullResult((value) => !value)}
                >
                  {showFullResult ? 'свернуть' : 'показать полностью'}
                </button>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
