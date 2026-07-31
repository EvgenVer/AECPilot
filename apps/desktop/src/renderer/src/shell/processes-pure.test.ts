import { describe, expect, it } from 'vitest'
import {
  describeKillError,
  describeKillOutcome,
  formatUptime,
  mergeProcessRows,
  toOtherRows,
  toOwnRows
} from './processes-pure'

describe('toOwnRows', () => {
  it('maps a running process, tail included', () => {
    const [row] = toOwnRows([
      {
        session_id: 'p1',
        command: 'npm run dev',
        cwd: 'C:/x',
        pid: 42,
        uptime_seconds: 12,
        status: 'running',
        output_tail: 'listening',
        output_preview: 'lis'
      }
    ])
    expect(row).toMatchObject({
      id: 'p1',
      command: 'npm run dev',
      pid: 42,
      status: 'running',
      exited: false,
      tail: 'listening',
      tailIsPreview: false,
      killable: true
    })
  })

  // The tail is 4000 chars, the preview 200 — using the preview when a tail
  // exists would throw away most of the output.
  it('falls back to the preview and says so', () => {
    const [row] = toOwnRows([
      { session_id: 'p1', command: 'x', status: 'running', output_preview: 'short' }
    ])
    expect(row.tail).toBe('short')
    expect(row.tailIsPreview).toBe(true)
  })

  it('does not offer to stop a process that already exited', () => {
    const [row] = toOwnRows([{ session_id: 'p1', command: 'x', status: 'exited' }])
    expect(row.exited).toBe(true)
    expect(row.killable).toBe(false)
  })

  it('survives an empty answer', () => {
    expect(toOwnRows(undefined)).toEqual([])
  })
})

describe('toOtherRows', () => {
  it('never marks another session process as killable', () => {
    const rows = toOtherRows([
      { session_id: 'p2', command: 'sleep 999', status: 'running', uptime: 30 }
    ])
    expect(rows[0].killable).toBe(false)
    expect(rows[0].uptimeSeconds).toBe(30)
  })
})

describe('mergeProcessRows', () => {
  // agents.list is unscoped and repeats our own processes; showing one twice —
  // once stoppable, once not — would read as two processes.
  it('drops from others whatever is already ours', () => {
    const own = toOwnRows([{ session_id: 'p1', command: 'a', status: 'running' }])
    const others = toOtherRows([
      { session_id: 'p1', command: 'a', status: 'running', uptime: 1 },
      { session_id: 'p2', command: 'b', status: 'running', uptime: 1 }
    ])
    const merged = mergeProcessRows(own, others)
    expect(merged.own).toHaveLength(1)
    expect(merged.others.map((row) => row.id)).toEqual(['p2'])
  })
})

describe('formatUptime', () => {
  it('keeps sub-minute uptimes in seconds', () => {
    expect(formatUptime(7)).toBe('7 с')
    expect(formatUptime(0)).toBe('0 с')
  })

  it('switches to minutes and hours', () => {
    expect(formatUptime(60)).toBe('1 мин')
    expect(formatUptime(59 * 60)).toBe('59 мин')
    expect(formatUptime(2 * 3600 + 5 * 60)).toBe('2 ч 05 мин')
  })

  it('says nothing rather than guessing for a missing value', () => {
    expect(formatUptime(undefined)).toBe('')
    expect(formatUptime(-1)).toBe('')
    expect(formatUptime(Number.NaN)).toBe('')
  })
})

describe('describeKillOutcome', () => {
  it('gives the three statuses three different messages', () => {
    const messages = ['killed', 'already_exited', 'not_found'].map((status) =>
      describeKillOutcome(status)
    )
    expect(new Set(messages).size).toBe(3)
  })

  it('passes their error text through for the error status', () => {
    expect(describeKillOutcome('error', 'no runtime handle')).toContain('no runtime handle')
  })

  it('does not pretend to understand an unknown status', () => {
    expect(describeKillOutcome('quantum')).toContain('quantum')
    expect(describeKillOutcome(undefined)).not.toBe('')
  })
})

describe('describeKillError', () => {
  it('explains 4044 as "another session owns it", not as a failure', () => {
    expect(describeKillError('gateway error 4044: no such process: p9')).toMatch(/другой сессии/)
  })

  it('passes anything else through unchanged', () => {
    expect(describeKillError('нет связи со шлюзом')).toBe('нет связи со шлюзом')
  })
})
