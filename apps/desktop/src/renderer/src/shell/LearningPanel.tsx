import { useEffect, useState } from 'react'
import type { LearningGraph } from '../../../shared/ipc'
import {
  countTimeline,
  LEARNING_EMPTY_HINT,
  toTimeline,
  UNKNOWN_DAY_LABEL,
  type TimelineNode
} from './learning-pure'

/** "Обучение" in the Агент hub (tasks 1.6.B3.10/B3.11).
 *
 * Reads `GET /api/learning/graph` — the `learning.frames` RPC this was planned
 * around raises on Windows (their `strftime("%-d")`). Nothing is lost by the
 * swap: the task only ever wanted the structural half, and the graph is that
 * half without their ASCII renderer in the way.
 *
 * A memory node opens with no call — its text is already in the graph. A skill
 * node fetches `learning.detail` once, when first opened. */
export default function LearningPanel() {
  const [graph, setGraph] = useState<LearningGraph | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [open, setOpen] = useState<string | undefined>(undefined)
  const [skillBodies, setSkillBodies] = useState<Record<string, string>>({})

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .getLearningGraph()
      .then((result) => {
        if (mounted) setGraph(result)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      mounted = false
    }
  }, [])

  async function toggle(node: TimelineNode): Promise<void> {
    if (open === node.id) {
      setOpen(undefined)
      return
    }
    setOpen(node.id)
    if (node.kind === 'memory' || skillBodies[node.id] !== undefined) return
    try {
      const detail = await window.aecpilot.getLearningNode(node.id)
      setSkillBodies((prev) => ({
        ...prev,
        [node.id]: detail.ok ? (detail.content ?? '') : (detail.message ?? 'содержимое недоступно')
      }))
    } catch (err) {
      setSkillBodies((prev) => ({
        ...prev,
        [node.id]: err instanceof Error ? err.message : String(err)
      }))
    }
  }

  const days = toTimeline(graph)
  const totals = countTimeline(days)

  return (
    <div className="learning-panel">
      {error && <div className="settings-popover__error">{error}</div>}

      {graph && days.length === 0 && (
        <div className="settings-section__empty">{LEARNING_EMPTY_HINT}</div>
      )}

      {days.length > 0 && (
        <div className="settings-section__hint">
          Скилов: {totals.skills} · записей памяти: {totals.memories}
        </div>
      )}

      <ul className="learning-timeline">
        {days.map((day) => (
          <li key={day.date} className="learning-day">
            <div className="learning-day__head">
              <span className="learning-day__date">
                {day.date === 'unknown' ? UNKNOWN_DAY_LABEL : day.date}
              </span>
              <span className="learning-day__counts">
                {day.skills} скилов · {day.memories} памятей
              </span>
            </div>
            <ul className="learning-day__nodes">
              {day.nodes.map((node) => (
                <li key={node.id} className="learning-node">
                  <button
                    type="button"
                    className="learning-node__label"
                    aria-expanded={open === node.id}
                    onClick={() => void toggle(node)}
                  >
                    <span className="learning-node__glyph">
                      {node.kind === 'memory' ? '◆' : '●'}
                    </span>
                    {node.label}
                  </button>
                  {open === node.id && (
                    <pre className="learning-node__body">
                      {node.kind === 'memory'
                        ? node.body || '(запись пуста)'
                        : (skillBodies[node.id] ?? 'читаю…')}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
