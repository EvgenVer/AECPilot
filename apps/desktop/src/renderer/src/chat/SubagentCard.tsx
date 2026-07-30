import type { ChatMoa, ChatSubagent } from './chat-state'

/** Two heads sharing a task — the delegation glyph. */
function SubagentIcon() {
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
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5a3 3 0 0 1 0 6" />
      <path d="M18 20a6 6 0 0 0-3-5.2" />
    </svg>
  )
}

const STATUS_LABEL: Record<ChatSubagent['status'], string> = {
  running: 'работает',
  complete: 'готово',
  interrupted: 'прервано'
}

/** One delegated child agent (task 1.6.A1).
 *
 * Nesting is by `depth`, which the gateway sends when it knows it — a child
 * of a child indents. Their own protocol comment says an emitter that omits
 * the identity fields is meant to render flat, so depth 0 is not treated as
 * missing data.
 *
 * The card shows what the child is FOR (its goal) and what it is doing right
 * now, because that is the only window into work happening off-screen: the
 * child's own reply tokens never reach this session at all. */
export default function SubagentCard({ agent }: { agent: ChatSubagent }) {
  const running = agent.status === 'running'
  return (
    <div
      className={`subagent-card subagent-card--${agent.status}`}
      style={
        agent.depth > 0 ? { marginInlineStart: `${Math.min(agent.depth, 4) * 14}px` } : undefined
      }
    >
      <div className="subagent-card__head">
        <span className="subagent-card__icon">
          <SubagentIcon />
        </span>
        <span className="subagent-card__goal" title={agent.goal}>
          {agent.goal || 'подагент'}
        </span>
        {agent.taskCount > 1 && (
          <span className="subagent-card__meta">
            {agent.taskIndex + 1}/{agent.taskCount}
          </span>
        )}
        {agent.model && <span className="subagent-card__meta">{agent.model}</span>}
        <span className="subagent-card__spacer" />
        <span className={`subagent-card__status subagent-card__status--${agent.status}`}>
          {STATUS_LABEL[agent.status]}
          {agent.durationS !== undefined && ` · ${agent.durationS.toFixed(1)}s`}
        </span>
      </div>
      {(running ? agent.activity : (agent.summary ?? agent.activity)) && (
        <div className="subagent-card__body">
          {running ? agent.activity : (agent.summary ?? agent.activity)}
        </div>
      )}
      {agent.toolCount > 0 && (
        <div className="subagent-card__tools">инструментов: {agent.toolCount}</div>
      )}
    </div>
  )
}

/** A Mixture-of-Agents turn (task 1.6.A2): who was consulted, and who merged
 * the answers. Deliberately a plain card, not a collapsible one — there is
 * nothing to expand, the whole content is these two lines. */
export function MoaCard({ moa }: { moa: ChatMoa }) {
  return (
    <div className="subagent-card subagent-card--moa">
      <div className="subagent-card__head">
        <span className="subagent-card__icon">
          <SubagentIcon />
        </span>
        <span className="subagent-card__goal">Совет моделей</span>
        <span className="subagent-card__spacer" />
        <span className="subagent-card__status">
          {moa.status === 'aggregating' ? 'сводит ответы' : 'опрашивает'}
          {moa.expected !== undefined && ` · ${moa.models.length}/${moa.expected}`}
        </span>
      </div>
      {moa.models.length > 0 && <div className="subagent-card__body">{moa.models.join(' · ')}</div>}
      {moa.aggregator && <div className="subagent-card__tools">сводит: {moa.aggregator}</div>}
    </div>
  )
}
