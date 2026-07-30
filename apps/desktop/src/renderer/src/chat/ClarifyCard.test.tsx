import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ClarifyCard from './ClarifyCard'

/** Task 1.6.12 — the parity gap their `clarify-tool.tsx` does not have: the
 * offered options must never be the only way out of a blocking question. */

const respondClarify = vi.fn()

beforeEach(() => {
  respondClarify.mockResolvedValue(undefined)
  window.aecpilot = { respondClarify } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderCard(choices: string[]) {
  const onResolved = vi.fn()
  render(
    <ClarifyCard
      request={{ kind: 'clarify', requestId: 'req-1', question: 'Какой каталог?', choices }}
      onResolved={onResolved}
    />
  )
  return onResolved
}

test('вариант выбирается, а уходит только по «Ответить»', async () => {
  const onResolved = renderCard(['первый', 'второй'])

  fireEvent.click(screen.getByRole('button', { name: /первый/ }))
  expect(respondClarify).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }))

  await waitFor(() => expect(respondClarify).toHaveBeenCalledWith('req-1', 'первый'))
  await waitFor(() => expect(onResolved).toHaveBeenCalledWith('req-1'))
})

test('свободный ответ доступен и при наличии вариантов', async () => {
  renderCard(['первый', 'второй'])

  const input = screen.getByLabelText('Ответ на уточняющий вопрос')
  fireEvent.change(input, { target: { value: 'ни то, ни другое' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }))

  await waitFor(() => expect(respondClarify).toHaveBeenCalledWith('req-1', 'ни то, ни другое'))
})

test('набранный текст отменяет выбранный вариант', async () => {
  renderCard(['первый', 'второй'])

  fireEvent.click(screen.getByRole('button', { name: /первый/ }))
  fireEvent.change(screen.getByLabelText('Ответ на уточняющий вопрос'), {
    target: { value: 'свой вариант' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }))

  await waitFor(() => expect(respondClarify).toHaveBeenCalledWith('req-1', 'свой вариант'))
})

test('«Пропустить» отправляет пустой ответ, а не оставляет агента ждать', async () => {
  renderCard(['первый'])

  fireEvent.click(screen.getByRole('button', { name: 'Пропустить' }))

  await waitFor(() => expect(respondClarify).toHaveBeenCalledWith('req-1', ''))
})

test('без вариантов карточка всё так же принимает свободный ответ', async () => {
  renderCard([])

  fireEvent.change(screen.getByLabelText('Ответ на уточняющий вопрос'), {
    target: { value: 'да' }
  })
  fireEvent.submit(screen.getByLabelText('Ответ на уточняющий вопрос').closest('form') as Element)

  await waitFor(() => expect(respondClarify).toHaveBeenCalledWith('req-1', 'да'))
})

test('ошибка отправки показывается на карточке, карточка не исчезает', async () => {
  respondClarify.mockRejectedValueOnce(new Error('нет ожидающего запроса'))
  const onResolved = renderCard([])

  fireEvent.change(screen.getByLabelText('Ответ на уточняющий вопрос'), {
    target: { value: 'да' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Ответить' }))

  await waitFor(() => expect(screen.getByText('нет ожидающего запроса')).toBeTruthy())
  expect(onResolved).not.toHaveBeenCalled()
})
