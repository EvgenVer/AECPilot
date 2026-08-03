import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ChatDock from './ChatDock'
import { initialChatState, type ChatState } from './chat-state'

/** Task 1.6.8 — the composer's behaviours, each tested through the real
 * component because the point of every one of them is a keyboard interaction:
 * history on the arrows, what happens to a message typed mid-turn, and slash
 * completions from the gateway.
 *
 * The mid-turn tests changed shape in task 1.6.B5.26: up to hermes 0.18.0 the
 * gateway REFUSED a prompt sent during a turn and this composer held a queue of
 * its own; 0.19.0 accepts it and applies the user's `display.busy_input_mode`
 * policy itself. The behaviour under test is therefore no longer "it is held
 * here" but "it leaves immediately and the answer is reported honestly". */

const submitPrompt = vi.fn()
const steerSession = vi.fn()
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
  submitPrompt.mockResolvedValue({ status: 'streaming' })
  steerSession.mockResolvedValue({ status: 'queued' })
  completeSlash.mockResolvedValue({ items: [] })
  completePath.mockResolvedValue({ items: [] })
  dispatchGoal.mockResolvedValue({ output: '' })
  pickAttachments.mockResolvedValue([])
  detachAttachment.mockResolvedValue({ count: 0 })
  pasteAttachment.mockResolvedValue({ ok: false, error: 'нет картинки' })
  window.aecpilot = {
    submitPrompt,
    steerSession,
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

test('во время хода сообщение уходит сразу, а не копится у нас (1.6.B5.26)', async () => {
  submitPrompt.mockResolvedValue({ status: 'queued' })
  const input = renderDock({ streaming: true })

  fireEvent.change(input, { target: { value: 'подожди, ещё вопрос' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  // Уходит немедленно: политику «очередь / подрулить / прервать» применяет
  // ядро по `display.busy_input_mode`, а не мы.
  await waitFor(() => expect(submitPrompt).toHaveBeenCalledWith('подожди, ещё вопрос'))
  expect(input.value).toBe('')
  // Локальной очереди больше нет вовсе.
  expect(screen.queryByLabelText('Очередь сообщений')).toBeNull()
})

test('ответ queued показывается как принятое, а не как отказ', async () => {
  submitPrompt.mockResolvedValue({ status: 'queued' })
  const input = renderDock({ streaming: true })

  fireEvent.change(input, { target: { value: 'ещё вопрос' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  await waitFor(() => expect(screen.getByText(/уйдёт следующим ходом/)).toBeDefined())
})

test('ответ steered показывается как влитое в идущий ход', async () => {
  submitPrompt.mockResolvedValue({ status: 'steered' })
  const input = renderDock({ streaming: true })

  fireEvent.change(input, { target: { value: 'учти ещё вот что' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  await waitFor(() => expect(screen.getByText(/влито в идущий ход/)).toBeDefined())
})

test('обычная отправка ничего не подтверждает — подтверждать нечего', async () => {
  const input = renderDock()
  fireEvent.change(input, { target: { value: 'вопрос' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(submitPrompt).toHaveBeenCalled())
  expect(screen.queryByText(/уйдёт следующим ходом/)).toBeNull()
})

test('подрулить можно только во время хода (1.6.B5.16)', () => {
  renderDock()
  expect(screen.queryByText('Подрулить')).toBeNull()

  cleanup()
  const input = renderDock({ streaming: true })
  fireEvent.change(input, { target: { value: 'смотри в другую сторону' } })
  expect(screen.getByText('Подрулить')).toBeDefined()
})

test('отклонённая подсказка — это ответ агента, а не сбой', async () => {
  steerSession.mockResolvedValue({ status: 'rejected' })
  const input = renderDock({ streaming: true })
  fireEvent.change(input, { target: { value: 'подсказка' } })
  fireEvent.click(screen.getByText('Подрулить'))

  await waitFor(() => expect(screen.getByText(/не принял подсказку/)).toBeDefined())
  expect(screen.queryByText(/^Ошибка/)).toBeNull()
})

test('4010 гасит кнопку до конца сессии и говорит об этом один раз', async () => {
  steerSession.mockRejectedValue(new Error('4010: agent does not support steer'))
  const input = renderDock({ streaming: true })
  fireEvent.change(input, { target: { value: 'подсказка' } })
  fireEvent.click(screen.getByText('Подрулить'))

  await waitFor(() => expect(screen.getByText(/не умеет принимать подсказки/)).toBeDefined())
  // Кнопки больше нет — повторять один и тот же отказ на каждое нажатие
  // бессмысленно.
  expect(screen.queryByText('Подрулить')).toBeNull()
  expect(steerSession).toHaveBeenCalledTimes(1)
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

// --- task 1.6.B5.27: editing a message and running the turn again -----------

test('правка сообщения обрезает историю до него и переспрашивает', async () => {
  const dispatch = vi.fn()
  render(
    <ChatDock
      state={{
        ...initialChatState,
        items: [
          { kind: 'message', id: 0, role: 'user', text: 'первый' },
          { kind: 'message', id: 1, role: 'assistant', text: 'ответ', status: 'complete' },
          { kind: 'message', id: 2, role: 'user', text: 'второй' }
        ],
        nextId: 3
      }}
      dispatch={dispatch}
      connectionState="ready"
      currentProject={null}
    />
  )

  // Правим ПЕРВОЕ сообщение пользователя — его порядковый номер среди
  // сообщений пользователя равен 0, а в ленте оно стоит нулевым лишь по
  // совпадению; их `truncate_before_user_ordinal` считает только ходы.
  fireEvent.click(screen.getAllByTitle('Изменить это сообщение и переспросить')[0] as HTMLElement)
  const input = screen.getByPlaceholderText('Спросите про проект…') as HTMLTextAreaElement
  expect(input.value).toBe('первый')

  fireEvent.change(input, { target: { value: 'первый, но иначе' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  await waitFor(() => expect(submitPrompt).toHaveBeenCalledWith('первый, но иначе', 0))
  expect(dispatch).toHaveBeenCalledWith({
    kind: 'user-resubmit',
    ordinal: 0,
    text: 'первый, но иначе'
  })
})

test('отказ 4018 показывается, а лента не трогается', async () => {
  submitPrompt.mockRejectedValue(
    new Error('4018: target user message is no longer in session history')
  )
  const dispatch = vi.fn()
  render(
    <ChatDock
      state={{
        ...initialChatState,
        items: [{ kind: 'message', id: 0, role: 'user', text: 'первый' }],
        nextId: 1
      }}
      dispatch={dispatch}
      connectionState="ready"
      currentProject={null}
    />
  )

  fireEvent.click(screen.getByTitle('Изменить это сообщение и переспросить'))
  const input = screen.getByPlaceholderText('Спросите про проект…') as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: 'другое' } })
  fireEvent.keyDown(input, { key: 'Enter' })

  await waitFor(() => expect(screen.getByText(/4018/)).toBeDefined())
  // Ничего не обрезано: их обработчик отверг ordinal, и обрезка, сделанная до
  // ответа, показывала бы то, чего не произошло.
  expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'user-resubmit' }))
})

test('во время хода править сообщение не предлагается', () => {
  render(
    <ChatDock
      state={{
        ...initialChatState,
        items: [{ kind: 'message', id: 0, role: 'user', text: 'первый' }],
        nextId: 1,
        streaming: true
      }}
      dispatch={() => {}}
      connectionState="ready"
      currentProject={null}
    />
  )
  // Их обработчик переписывает историю сессии — не то, что делают, пока агент
  // её читает.
  expect(screen.queryByTitle('Изменить это сообщение и переспросить')).toBeNull()
})
