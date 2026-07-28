import { useState } from 'react'
import type { ChatReasoning } from './chat-state'
import { reasoningMeta } from './reasoning-meta-pure'
import { MarkdownTextContent } from './vendor/hermes/markdown-text'

/** Brain outline — design/screens/Chat.html §5.9's reasoning card icon. */
function BrainIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2Z" />
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

/** The agent's train of thought for one turn (task 1.5.D1), per
 * design/screens/Chat.html §5.9. Collapsed by default — specs/agent-chat.md
 * requires it not to crowd out the answer — showing a clamped preview; the
 * header toggles the full text.
 *
 * The meta line ("3 шага · 4 с") comes from `reasoningMeta`, which returns
 * `undefined` when there is no honest signal, in which case nothing is
 * rendered in its place. */
export default function ReasoningCard({ block }: { block: ChatReasoning }) {
  const [expanded, setExpanded] = useState(false)
  const meta = reasoningMeta(block)
  const streaming = block.status === 'streaming'

  return (
    <div className="reasoning-card">
      <button
        type="button"
        className="reasoning-card__head"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="reasoning-card__icon">
          <BrainIcon />
        </span>
        <span className="reasoning-card__title">Рассуждение</span>
        {streaming && <span className="reasoning-card__live">идёт…</span>}
        {meta && <span className="reasoning-card__meta">{meta}</span>}
        <span className="reasoning-card__spacer" />
        <span className="reasoning-card__chevron">
          <ChevronIcon open={expanded} />
        </span>
      </button>
      {/* Task 1.6.5, a defect the owner's manual run proved: reasoning arrives
          as markdown (`**Responding in Russian**\n\n…`) and we printed it raw,
          so the asterisks showed and the paragraphs collapsed into one line.
          It goes through the same renderer as an answer — same vendored
          component, sized down by CSS. */}
      <div className={`reasoning-card__body${expanded ? '' : ' reasoning-card__body--clamped'}`}>
        <MarkdownTextContent text={block.text} isRunning={streaming} />
      </div>
    </div>
  )
}
