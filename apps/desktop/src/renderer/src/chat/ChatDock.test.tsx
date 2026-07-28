import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChatDock from './ChatDock'
import { initialChatState, type ChatState } from './chat-state'

/** Task 1.6.8 — the composer's three new behaviours, each tested through the
 * real component because the point of every one of them is a keyboard
 * interaction: history on the arrows, the queue while the agent is busy, and
 * slash completions from the gateway. */

const submitPrompt = vi.fn()
const completeSlash = vi.fn()

beforeEach(() => {
  submitPrompt.mockResolvedValue(undefined)
  completeSlash.mockResolvedValue({ items: [] })
  window.aecpilot = {
    submitPrompt,
    completeSlash,
    listSessions: async () => ({ sessions: [] })
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderDock(state: Partial<ChatState> = {}): HTMLTextAreaElement {
  render(
    <ChatDock
      state={{ ...initialChatState, ...state }}
      dispatch={() => {}}
      connectionState="ready"
      currentProject={null}
    />
  )
  return screen.getByPlaceholderText('Спросите про проект…') as HTMLTextAreaElement
}

test('стрелка вверх поднимает отправленное, вниз возвращает черновик', async () => {
  const input = renderDock()

  fireEvent.change(input, { target: { value: 'первый вопрос' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(submitPrompt).toHaveBeenCalledWith('первый вопрос'))

  fireEvent.change(input, { target: { value: 'недописанное' } })
  input.setSelectionRange(0, 0)
  fireEvent.keyDown(input, { key: 'ArrowUp' })
  expect(input.value).toBe('первый вопрос')

  input.setSelectionRange(input.value.length, input.value.length)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  // Черновик не потерян — он ждал, пока по истории ходят.
  expect(input.value).toBe('недописанное')
})

test('пока агент занят, сообщение уходит в очередь, а не теряется', async () => {
  const input = renderDock({ streaming: true })

  fireEvent.change(input, { target: { value: 'подожди, ещё вопрос' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  // Не отправлено, но и не пропало: видно в очереди, поле очищено.
  expect(submitPrompt).not.toHaveBeenCalled()
  expect(screen.getByText('подожди, ещё вопрос')).toBeDefined()
  expect(input.value).toBe('')
})

test('очередь можно поправить до отправки', async () => {
  const input = renderDock({ streaming: true })
  fireEvent.change(input, { target: { value: 'с опечаткай' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  fireEvent.click(screen.getByTitle('Изменить'))
  // Вернулось в поле для правки и ушло из очереди.
  expect(input.value).toBe('с опечаткай')
  expect(screen.queryByLabelText('Очередь сообщений')).toBeNull()
})

test('поле ввода не блокируется во время ответа агента', () => {
  const input = renderDock({ streaming: true })
  expect(input.disabled).toBe(false)
})

test('слэш открывает подсказки из шлюза и подставляет выбранную', async () => {
  completeSlash.mockResolvedValue({
    items: [
      { text: '/model', display: '/model', meta: 'Сменить модель' },
      { text: '/compact', display: '/compact', meta: 'Компактный режим' }
    ]
  })
  const input = renderDock()

  fireEvent.change(input, { target: { value: '/mo' } })
  await waitFor(() => expect(screen.getByText('/model')).toBeDefined())
  expect(completeSlash).toHaveBeenCalledWith('/mo')

  // Enter при открытом списке подставляет команду, а не отправляет.
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input.value).toBe('/model ')
  expect(submitPrompt).not.toHaveBeenCalled()
})

test('после пробела подсказки закрываются', async () => {
  completeSlash.mockResolvedValue({
    items: [{ text: '/model', display: '/model', meta: '' }]
  })
  const input = renderDock()

  fireEvent.change(input, { target: { value: '/model' } })
  await waitFor(() => expect(screen.getByText('/model')).toBeDefined())

  fireEvent.change(input, { target: { value: '/model gpt' } })
  await waitFor(() => expect(screen.queryByLabelText('Команды')).toBeNull())
})
