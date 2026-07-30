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
// Task 1.6.A5: the goal badge polls on mount, so the dock cannot be rendered
// without this. Empty output is their "no goal", which keeps the badge off
// screen and leaves these tests about the composer.
const dispatchGoal = vi.fn()
const completePath = vi.fn()
const pickAttachments = vi.fn()
const detachAttachment = vi.fn()
const pasteAttachment = vi.fn()

beforeEach(() => {
  submitPrompt.mockResolvedValue(undefined)
  completeSlash.mockResolvedValue({ items: [] })
  completePath.mockResolvedValue({ items: [] })
  dispatchGoal.mockResolvedValue({ output: '' })
  pickAttachments.mockResolvedValue([])
  detachAttachment.mockResolvedValue({ count: 0 })
  pasteAttachment.mockResolvedValue({ ok: false, error: 'нет картинки' })
  window.aecpilot = {
    submitPrompt,
    completeSlash,
    completePath,
    dispatchGoal,
    pickAttachments,
    detachAttachment,
    pasteAttachment,
    onChatEvent: () => () => {},
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

// Задача 1.6.A3 — `@`-ссылки на файлы и папки в композере.
test('собака в середине текста открывает список путей от шлюза', async () => {
  completePath.mockResolvedValue({
    items: [{ text: '@file:src/main.ts', display: 'main.ts', meta: 'src' }]
  })
  const input = renderDock()

  fireEvent.change(input, { target: { value: 'посмотри @ma', selectionStart: 12 } })
  await waitFor(() => expect(completePath).toHaveBeenCalledWith('@ma'))
  expect(await screen.findByText('main.ts')).toBeTruthy()
})

test('выбор пути подставляется на место набранного, остальной текст цел', async () => {
  completePath.mockResolvedValue({
    items: [{ text: '@file:src/main.ts', display: 'main.ts', meta: 'src' }]
  })
  const input = renderDock()

  fireEvent.change(input, { target: { value: 'посмотри @ma и скажи', selectionStart: 12 } })
  const row = await screen.findByText('main.ts')
  fireEvent.click(row)

  expect(input.value).toBe('посмотри @file:src/main.ts и скажи')
})

test('почтовый адрес списком путей не считается', async () => {
  const input = renderDock()
  fireEvent.change(input, {
    target: { value: 'пиши на ivan@example.com', selectionStart: 24 }
  })
  await waitFor(() => expect(completeSlash).not.toHaveBeenCalled())
  expect(completePath).not.toHaveBeenCalled()
})

// Задача 1.6.A4 — вложения.
test('прикреплённый файл виден чипом и снимается крестиком', async () => {
  pickAttachments.mockResolvedValue([{ ok: true, path: 'C:\\pics\\план.png', count: 1 }])
  renderDock()

  fireEvent.click(screen.getByLabelText('Прикрепить файл'))
  expect(await screen.findByText('план.png')).toBeTruthy()

  fireEvent.click(screen.getByLabelText('Убрать вложение: план.png'))
  await waitFor(() => expect(screen.queryByText('план.png')).toBeNull())
  expect(detachAttachment).toHaveBeenCalledWith('C:\\pics\\план.png')
})

test('отказ шлюза объясняется, а не проглатывается', async () => {
  pickAttachments.mockResolvedValue([
    { ok: false, error: 'pdftoppm not installed (poppler-utils package required)' }
  ])
  renderDock()

  fireEvent.click(screen.getByLabelText('Прикрепить файл'))
  expect(await screen.findByText(/poppler/)).toBeTruthy()
})

test('вложения уходят вместе с сообщением, а не остаются висеть', async () => {
  pickAttachments.mockResolvedValue([{ ok: true, path: 'C:\\pics\\план.png', count: 1 }])
  const input = renderDock()

  fireEvent.click(screen.getByLabelText('Прикрепить файл'))
  await screen.findByText('план.png')

  fireEvent.change(input, { target: { value: 'что тут' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  await waitFor(() => expect(submitPrompt).toHaveBeenCalledWith('что тут'))
  expect(screen.queryByText('план.png')).toBeNull()
})
