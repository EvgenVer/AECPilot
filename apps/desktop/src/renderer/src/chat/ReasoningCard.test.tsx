import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReasoningCard from './ReasoningCard'
import type { ChatReasoning } from './chat-state'

/**
 * Covers specs/agent-chat.md "Ход рассуждений сохраняет переводы строк и
 * разметку" — the second defect proved by the owner's manual run of
 * 2026-07-26: reasoning arrives as markdown and used to be printed raw.
 */

afterEach(cleanup)

function block(text: string, status: ChatReasoning['status'] = 'complete'): ChatReasoning {
  return { kind: 'reasoning', id: 1, text, segments: 1, status }
}

test('абзацы рассуждения не слипаются в одну строку', async () => {
  const { container } = render(<ReasoningCard block={block('Первый абзац.\n\nВторой абзац.')} />)

  await waitFor(() => expect(container.querySelectorAll('p').length).toBeGreaterThan(0))
  const paragraphs = [...container.querySelectorAll('p')].map((p) => p.textContent)
  expect(paragraphs).toEqual(['Первый абзац.', 'Второй абзац.'])
})

test('подзаголовок виден разметкой, а не звёздочками', async () => {
  // Ровно то, что приходило в прогоне владельца.
  const { container } = render(
    <ReasoningCard block={block('**Responding in Russian**\n\nПользователь спросил про ИД.')} />
  )

  await waitFor(() => expect(container.textContent).toContain('Responding in Russian'))
  expect(container.textContent ?? '').not.toContain('**')
  expect(container.querySelector('strong, [data-streamdown="strong"]')?.textContent).toBe(
    'Responding in Russian'
  )
})

test('markdown-заголовок в рассуждении становится заголовком', async () => {
  const { container } = render(<ReasoningCard block={block('## План\n\nСначала проверю ТЗ.')} />)

  await waitFor(() => expect(container.querySelector('h2')).not.toBeNull())
  expect(container.querySelector('h2')?.textContent).toBe('План')
  expect(container.textContent ?? '').not.toContain('##')
})

test('карточка по-прежнему свёрнута по умолчанию и разворачивается', async () => {
  // Разметка не должна ломать саму механику складки (задача 1.5.D1).
  const { container } = render(<ReasoningCard block={block('# Заголовок\n\nтело')} />)

  const head = screen.getByRole('button')
  expect(head.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('.reasoning-card__body--clamped')).not.toBeNull()

  fireEvent.click(head)
  expect(head.getAttribute('aria-expanded')).toBe('true')
  expect(container.querySelector('.reasoning-card__body--clamped')).toBeNull()
})
