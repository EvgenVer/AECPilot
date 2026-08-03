// Tasks 1.6.B5.11–B5.15 — session details. The distinction under test in most
// of these: the gateway omits what it cannot measure, so "absent" and "zero"
// must not render the same.

import { describe, expect, it } from 'vitest'
import {
  breakdownRows,
  creditLines,
  describeCompression,
  describeContextFill,
  describeUndo,
  formatTokens,
  usageLines,
  THOUSANDS_SEPARATOR as NB,
  UNDO_HINT
} from './session-details-pure'

describe('usageLines', () => {
  it('shows the four numbers the panel is about', () => {
    const lines = usageLines({ input: 1200, output: 340, reasoning: 90, calls: 7 })
    expect(lines.map((l) => `${l.label}: ${l.value}`)).toEqual([
      `Вход: 1${NB}200`,
      'Выход: 340',
      'Размышления: 90',
      'Вызовов к модели: 7'
    ])
  })

  it('shows a dash for a number the gateway did not send', () => {
    const lines = usageLines({ input: 10 })
    expect(lines[2]?.value).toBe('—')
  })

  it('renders nothing at all without a usage answer', () => {
    expect(usageLines(undefined)).toEqual([])
  })
})

describe('describeContextFill', () => {
  it('reports the fill when the core measured it', () => {
    expect(describeContextFill({ context_used: 12_400, context_max: 128_000 })).toBe(
      `12${NB}400 из 128${NB}000 (10 %)`
    )
  })

  it('says "unknown" rather than 0 % when the fields are absent', () => {
    // Their handler omits these exactly when occupancy is unmeasurable; a 0 %
    // gauge would be a reading nobody took.
    expect(describeContextFill({ input: 5 })).toContain('неизвестно')
    expect(describeContextFill({ input: 5 })).not.toContain('0 %')
  })

  it('treats a zero window size as unknown too', () => {
    expect(describeContextFill({ context_used: 100, context_max: 0 })).toContain('неизвестно')
  })
})

describe('creditLines', () => {
  it('is empty when the block is absent, so the section can be hidden', () => {
    expect(creditLines({ input: 1 })).toEqual([])
    expect(creditLines({ credits_lines: [] })).toEqual([])
  })

  it('drops blank lines', () => {
    expect(creditLines({ credits_lines: ['Credits: 12', '   '] })).toEqual(['Credits: 12'])
  })
})

describe('breakdownRows', () => {
  const result = {
    categories: [
      {
        id: 'system_prompt',
        label: 'System prompt',
        tokens: 300,
        color: 'var(--ui-text-tertiary)'
      },
      { id: 'conversation', label: 'Conversation', tokens: 700, color: 'var(--ui-accent)' }
    ]
  }

  it('computes each category share', () => {
    expect(breakdownRows(result).map((r) => r.share)).toEqual([30, 70])
  })

  it('drops their color: it is a CSS variable of THEIR design system', () => {
    for (const row of breakdownRows(result)) {
      expect(Object.keys(row)).toEqual(['id', 'label', 'tokens', 'share'])
    }
  })

  it('is empty when no agent is built yet', () => {
    expect(breakdownRows({ categories: [] })).toEqual([])
    expect(breakdownRows(undefined)).toEqual([])
  })
})

describe('describeCompression', () => {
  it('reports before and after for both messages and tokens', () => {
    const text = describeCompression({
      status: 'compressed',
      beforeMessages: 40,
      afterMessages: 12,
      beforeTokens: 90_000,
      afterTokens: 21_000
    })
    expect(text).toContain('40 → 12')
    expect(text).toContain(`90${NB}000 → 21${NB}000`)
  })

  it('does not dress up their "aborted" as a success', () => {
    expect(
      describeCompression({
        status: 'aborted',
        beforeMessages: 3,
        afterMessages: 3,
        beforeTokens: 100,
        afterTokens: 100
      })
    ).toContain('не стало сжимать')
  })
})

describe('undo wording', () => {
  it('names the limitation their handler actually has', () => {
    // session.undo pops the in-memory history and never calls
    // replace_messages — the turn is back after a resume, and the text has to
    // say so (owner decision B5-3).
    expect(UNDO_HINT).toContain('вернётся')
    expect(UNDO_HINT).toContain('истории')
  })

  it('says there was nothing to undo instead of claiming success', () => {
    expect(describeUndo(0)).toContain('Отменять нечего')
    expect(describeUndo(3)).toContain('3')
  })
})

describe('formatTokens', () => {
  it('groups thousands', () => {
    expect(formatTokens(1_234_567)).toBe(`1${NB}234${NB}567`)
  })

  it('is a dash for a missing number', () => {
    expect(formatTokens(undefined)).toBe('—')
  })
})
