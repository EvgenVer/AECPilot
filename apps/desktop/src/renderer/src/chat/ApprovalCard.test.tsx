import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ApprovalCard from './ApprovalCard'
import type { ApprovalRequest } from './chat-state'

/** Task 1.6.12 — the three behaviours the parity pass against their
 * `tool/approval.tsx` brought over: the keyboard path, and the permanent
 * allow going through a confirmation instead of firing from one click. */

const respondApproval = vi.fn()

const request: ApprovalRequest = {
  command: 'rm -rf /tmp/x',
  description: 'опасная команда',
  patternKeys: ['rm'],
  allowPermanent: true
}

beforeEach(() => {
  respondApproval.mockResolvedValue({ resolved: 1 })
  window.aecpilot = { respondApproval } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderCard(overrides: Partial<ApprovalRequest> = {}) {
  const onResolved = vi.fn()
  render(
    <ApprovalCard request={{ ...request, ...overrides }} queueLength={1} onResolved={onResolved} />
  )
  return onResolved
}

test('Ctrl+Enter разрешает один раз', async () => {
  const onResolved = renderCard()

  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

  await waitFor(() => expect(respondApproval).toHaveBeenCalledWith('once'))
  await waitFor(() => expect(onResolved).toHaveBeenCalledWith(1))
})

test('Esc отклоняет запрос', async () => {
  renderCard()

  fireEvent.keyDown(window, { key: 'Escape' })

  await waitFor(() => expect(respondApproval).toHaveBeenCalledWith('deny'))
})

test('«Всегда» не отправляется с одного клика — сначала подтверждение', async () => {
  renderCard()

  fireEvent.click(screen.getByRole('button', { name: 'Всегда' }))

  expect(respondApproval).not.toHaveBeenCalled()
  // Подтверждение объясняет, что правило сохранится по шаблону, а не по этой
  // конкретной команде.
  expect(screen.getByText('rm')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Разрешать всегда' }))

  await waitFor(() => expect(respondApproval).toHaveBeenCalledWith('always'))
})

test('Esc в состоянии подтверждения закрывает его, а не отклоняет запрос', () => {
  renderCard()

  fireEvent.click(screen.getByRole('button', { name: 'Всегда' }))
  fireEvent.keyDown(window, { key: 'Escape' })

  expect(respondApproval).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /Разрешить/ })).toBeTruthy()
})

test('запрет постоянного разрешения прячет кнопку «Всегда»', () => {
  renderCard({ allowPermanent: false })

  expect(screen.queryByRole('button', { name: 'Всегда' })).toBeNull()
})
