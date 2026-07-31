// Pure logic behind the "Обучение" screen (tasks 1.6.B3.10/B3.11).
//
// Source: `GET /api/learning/graph`, NOT the `learning.frames` RPC this was
// planned around — that one raises on Windows ("Invalid format string": their
// `_period_label` calls `strftime("%-d %b")`, a glibc extension). The graph
// endpoint does no date formatting at all, so the grouping into days happens
// here, from raw epoch timestamps.

import type { LearningGraph, LearningMemoryCard, LearningNode } from '../../../shared/ipc'

export interface TimelineNode {
  id: string
  label: string
  kind: 'skill' | 'memory'
  /** Present for memory nodes only — the graph already carries the text, so
   * opening one needs no further call. */
  body?: string
  category?: string
}

export interface TimelineDay {
  /** `YYYY-MM-DD`, used as the key and as the visible date. */
  date: string
  skills: number
  memories: number
  nodes: TimelineNode[]
}

/** Formats an epoch timestamp as `YYYY-MM-DD` in local time.
 *
 * Local, not UTC: these are events on the user's own machine, and a skill
 * learned at 01:00 local sliding into "yesterday" would be confusing. Deriving
 * the parts by hand rather than through `toISOString` for the same reason —
 * that one is always UTC. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function memoryBodies(memory: LearningMemoryCard[] | undefined): Map<string, string> {
  // Their own id scheme: `memory:<source>:<index-in-the-memory-array>`
  // (`agent/learning_graph_render.py`'s `memory_lookup`).
  const bodies = new Map<string, string>()
  ;(memory ?? []).forEach((card, index) => {
    if (card && typeof card.source === 'string') {
      bodies.set(`memory:${card.source}:${index}`, card.body ?? '')
    }
  })
  return bodies
}

function nodeKind(node: LearningNode): 'skill' | 'memory' {
  return node.kind === 'memory' || node.id.startsWith('memory:') ? 'memory' : 'skill'
}

/** Groups graph nodes into days, newest first.
 *
 * A node with no usable timestamp is NOT dropped and NOT given today's date —
 * it goes into an "unknown" group at the end. Dropping it would hide something
 * the agent actually learned; dating it today would be an invention. */
export function toTimeline(graph: LearningGraph | undefined): TimelineDay[] {
  const bodies = memoryBodies(graph?.memory)
  const byDay = new Map<string, TimelineDay>()

  for (const node of graph?.nodes ?? []) {
    if (!node || typeof node.id !== 'string' || node.id === '') continue
    const kind = nodeKind(node)
    const key =
      typeof node.timestamp === 'number' && Number.isFinite(node.timestamp) && node.timestamp > 0
        ? dayKey(node.timestamp)
        : 'unknown'

    let day = byDay.get(key)
    if (!day) {
      day = { date: key, skills: 0, memories: 0, nodes: [] }
      byDay.set(key, day)
    }
    if (kind === 'memory') day.memories += 1
    else day.skills += 1
    day.nodes.push({
      id: node.id,
      label: (node.label ?? node.id).trim() || node.id,
      kind,
      ...(kind === 'memory' ? { body: bodies.get(node.id) ?? '' } : {}),
      ...(node.category ? { category: node.category } : {})
    })
  }

  const days = [...byDay.values()]
  const dated = days
    .filter((day) => day.date !== 'unknown')
    .sort((a, b) => b.date.localeCompare(a.date))
  const undated = days.filter((day) => day.date === 'unknown')
  return [...dated, ...undated]
}

export function countTimeline(days: TimelineDay[]): { skills: number; memories: number } {
  return days.reduce(
    (total, day) => ({
      skills: total.skills + day.skills,
      memories: total.memories + day.memories
    }),
    { skills: 0, memories: 0 }
  )
}

export const LEARNING_EMPTY_HINT =
  'Агент пока ничему не научился. Здесь появятся скилы, которые он завёл сам, и записи его памяти.'

export const UNKNOWN_DAY_LABEL = 'без даты'
