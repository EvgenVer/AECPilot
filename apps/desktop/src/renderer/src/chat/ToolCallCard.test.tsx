import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import ToolCallCard from './ToolCallCard'
import type { ChatToolCall } from './chat-state'
import { formatElapsed, resetElapsedTimers } from './vendor/hermes/activity-timer'

/** Task 1.6.7 — the tool card on their behaviour: a running call counts
 * seconds out loud, a settled one shows labelled sections, and the label can
 * never be empty (the standing guarantee from task 1.5.2). */

function call(fields: Partial<ChatToolCall> = {}): ChatToolCall {
  return {
    kind: 'tool',
    toolId: 't1',
    name: 'read_file',
    context: 'ТЗ-2024.pdf',
    status: 'running',
    ...fields
  }
}

afterEach(() => {
  cleanup()
  resetElapsedTimers()
})

describe('formatElapsed', () => {
  test('секунды и минуты в наших формах', () => {
    expect(formatElapsed(0)).toBe('0 с')
    expect(formatElapsed(7)).toBe('7 с')
    expect(formatElapsed(59)).toBe('59 с')
    expect(formatElapsed(60)).toBe('1:00')
    expect(formatElapsed(65)).toBe('1:05')
    expect(formatElapsed(600)).toBe('10:00')
  })
})

describe('живой счётчик выполнения', () => {
  beforeEach(() => {
    // `Date` must be faked too: the counter is computed from `Date.now()`,
    // not from the number of ticks.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('идущий инструмент считает секунды вслух', () => {
    render(<ToolCallCard call={call()} />)
    expect(screen.getByText(/выполняется…/)).toHaveProperty('textContent', 'выполняется… 0 с')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText(/выполняется…/).textContent).toBe('выполняется… 3 с')
  })

  test('завершённый инструмент показывает длительность, а не счётчик', () => {
    render(<ToolCallCard call={call({ status: 'complete', durationS: 0.42 })} />)
    expect(screen.queryByText(/выполняется…/)).toBeNull()
    expect(screen.getByText('0.4s')).toBeDefined()
  })
})

describe('содержимое развёрнутой карточки', () => {
  test('аргументы и результат подписаны', () => {
    render(
      <ToolCallCard call={call({ status: 'complete', args: { path: 'a.md' }, result: 'готово' })} />
    )
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByText('Аргументы')).toBeDefined()
    expect(screen.getByText('Результат')).toBeDefined()
  })

  test('подпись инструмента не бывает пустой (гарантия 1.5.2)', () => {
    const { container } = render(<ToolCallCard call={call({ name: '   ' })} />)
    const name = container.querySelector('.tool-card__name')?.textContent ?? ''
    expect(name.trim().length).toBeGreaterThan(0)
  })

  test('карточке без деталей не приделывают кнопку', () => {
    const { container } = render(<ToolCallCard call={call({ status: 'complete' })} />)
    expect(container.querySelector('button')).toBeNull()
    expect(container.querySelector('.tool-card__head--static')).not.toBeNull()
  })
})
