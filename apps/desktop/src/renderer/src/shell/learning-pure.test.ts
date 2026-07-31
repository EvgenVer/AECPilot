import { describe, expect, it } from 'vitest'
import { countTimeline, dayKey, toTimeline } from './learning-pure'

// 2026-03-05 12:00 local, as an epoch in seconds.
const march5 = Math.floor(new Date(2026, 2, 5, 12, 0, 0).getTime() / 1000)
const march6 = Math.floor(new Date(2026, 2, 6, 9, 0, 0).getTime() / 1000)

describe('dayKey', () => {
  it('formats in local time', () => {
    expect(dayKey(march5)).toBe('2026-03-05')
  })

  // A skill learned at 01:00 local sliding into "yesterday" would be
  // confusing; toISOString would do exactly that.
  it('keeps an early-morning event on its own local day', () => {
    const earlyLocal = Math.floor(new Date(2026, 2, 5, 1, 0, 0).getTime() / 1000)
    expect(dayKey(earlyLocal)).toBe('2026-03-05')
  })
})

describe('toTimeline', () => {
  it('groups nodes by day, newest first, counting skills and memories apart', () => {
    const days = toTimeline({
      nodes: [
        { id: 'skill-a', kind: 'skill', timestamp: march5 },
        { id: 'memory:AGENTS.md:0', kind: 'memory', timestamp: march5 },
        { id: 'skill-b', kind: 'skill', timestamp: march6 }
      ],
      memory: [{ source: 'AGENTS.md', body: 'помню про источники' }]
    })
    expect(days.map((day) => day.date)).toEqual(['2026-03-06', '2026-03-05'])
    expect(days[1]).toMatchObject({ skills: 1, memories: 1 })
  })

  // The graph already carries the memory text, so opening one needs no call.
  it('attaches the memory body from the graph', () => {
    const days = toTimeline({
      nodes: [{ id: 'memory:AGENTS.md:0', kind: 'memory', timestamp: march5 }],
      memory: [{ source: 'AGENTS.md', body: 'тело записи' }]
    })
    expect(days[0].nodes[0].body).toBe('тело записи')
    expect(days[0].nodes[0].kind).toBe('memory')
  })

  it('recognises a memory node by its id even without the kind field', () => {
    const days = toTimeline({ nodes: [{ id: 'memory:x:0', timestamp: march5 }], memory: [] })
    expect(days[0].nodes[0].kind).toBe('memory')
    expect(days[0].memories).toBe(1)
  })

  it('gives a memory node with no matching card an empty body, not undefined', () => {
    const days = toTimeline({ nodes: [{ id: 'memory:gone:9', timestamp: march5 }], memory: [] })
    expect(days[0].nodes[0].body).toBe('')
  })

  // Dropping it hides something the agent learned; dating it today invents a
  // fact.
  it('keeps an undated node in its own group at the end', () => {
    const days = toTimeline({
      nodes: [
        { id: 'skill-a', kind: 'skill', timestamp: march5 },
        { id: 'skill-b', kind: 'skill' }
      ],
      memory: []
    })
    expect(days.map((day) => day.date)).toEqual(['2026-03-05', 'unknown'])
    expect(days[1].nodes[0].id).toBe('skill-b')
  })

  it('treats a zero or nonsense timestamp as undated', () => {
    const days = toTimeline({
      nodes: [
        { id: 'a', timestamp: 0 },
        { id: 'b', timestamp: Number.NaN }
      ],
      memory: []
    })
    expect(days).toHaveLength(1)
    expect(days[0].date).toBe('unknown')
  })

  it('falls back to the id when the label is empty', () => {
    const days = toTimeline({
      nodes: [{ id: 'skill-a', label: '   ', timestamp: march5 }],
      memory: []
    })
    expect(days[0].nodes[0].label).toBe('skill-a')
  })

  it('drops nodes with no id at all', () => {
    const days = toTimeline({ nodes: [{ id: '' }, { id: 'ok', timestamp: march5 }], memory: [] })
    expect(days.flatMap((day) => day.nodes)).toHaveLength(1)
  })

  it('survives an empty or missing graph', () => {
    expect(toTimeline({ nodes: [], memory: [] })).toEqual([])
    expect(toTimeline(undefined)).toEqual([])
  })
})

describe('countTimeline', () => {
  it('totals both kinds across days', () => {
    const days = toTimeline({
      nodes: [
        { id: 'a', kind: 'skill', timestamp: march5 },
        { id: 'memory:m:0', kind: 'memory', timestamp: march6 }
      ],
      memory: [{ source: 'm', body: '' }]
    })
    expect(countTimeline(days)).toEqual({ skills: 1, memories: 1 })
  })
})
