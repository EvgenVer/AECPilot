// Экран комнаты (задача 3C.6, контракт — specs/agent-roster.md §Р5).
//
// Проверяется то, что человек видит ГЛАЗАМИ и без чего комната обманывает:
// сколько участников ответит до отправки (это цена), почему тихо (лента круга)
// и что комнате нужен он сам.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { GroupPanel } from './GroupPanel'
import { AecI18nProvider } from '../../shared/i18n'
import type { GroupRoomView, RoomEventView, SpecialistView } from '../../../../shared/ipc'

function specialist(name: string, title: string): SpecialistView {
  return {
    name,
    title,
    role: '',
    description: '',
    isDefault: false,
    model: '',
    provider: '',
    face: null,
    hasAvatar: false,
    hidden: false,
    chatSessionId: '',
    preview: '',
    previewAt: '',
    busy: false
  }
}

const ROSTER = [
  specialist('smeta', 'Смета'),
  specialist('elektrika', 'Электрика'),
  specialist('gip', 'Главный инженер')
]

const listRooms = vi.fn()
const roomTranscript = vi.fn()
const createRoom = vi.fn()
const disbandRoom = vi.fn()
const willAnswerInRoom = vi.fn()
const askRoom = vi.fn()
const editRoom = vi.fn()

/** Подписчики ленты круга: главный процесс шлёт события по ходу разговора. */
let feed: ((event: RoomEventView) => void)[] = []

function room(overrides: Partial<GroupRoomView> = {}): GroupRoomView {
  return {
    id: 'к-1',
    title: 'Раздел 5',
    members: ['smeta', 'elektrika', 'gip'],
    face: null,
    needsYou: false,
    ...overrides
  }
}

function show(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AecI18nProvider>
        <GroupPanel roster={ROSTER} />
      </AecI18nProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  feed = []
  listRooms.mockResolvedValue([room()])
  roomTranscript.mockResolvedValue([])
  createRoom.mockResolvedValue({ ok: true, id: 'к-новая' })
  disbandRoom.mockResolvedValue({ ok: true })
  willAnswerInRoom.mockResolvedValue(['smeta', 'elektrika', 'gip'])
  askRoom.mockResolvedValue({ ok: true, turns: [] })
  editRoom.mockResolvedValue({ ok: true })

  window.aecpilot = {
    listRooms,
    roomTranscript,
    createRoom,
    disbandRoom,
    willAnswerInRoom,
    askRoom,
    editRoom,
    onRoomEvent: (cb: (event: RoomEventView) => void) => {
      feed.push(cb)
      return () => {
        feed = feed.filter((one) => one !== cb)
      }
    }
  } as unknown as typeof window.aecpilot
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('список комнат', () => {
  it('показывает комнаты и открывает выбранную', async () => {
    show()

    fireEvent.click(await screen.findByText('Раздел 5'))

    expect(await screen.findByLabelText('Сообщение в комнату')).toBeTruthy()
  })

  it('«нужны вы» видно НЕ одним цветом — словами', async () => {
    // Цвет теряется у тех, кто его не различает, а комната зовёт человека
    // всерьёз: спорное поднимается ему, а не решается большинством.
    listRooms.mockResolvedValue([room({ needsYou: true })])
    show()

    expect(await screen.findByText('нужны вы')).toBeTruthy()
  })

  it('пустой список объясняет, что такое комната', async () => {
    listRooms.mockResolvedValue([])
    show()

    expect(await screen.findByText(/комната это совещание/i)).toBeTruthy()
  })
})

describe('создание', () => {
  it('меньше двоих собрать нельзя', async () => {
    listRooms.mockResolvedValue([])
    show()

    fireEvent.click(await screen.findByText('Новая комната'))
    fireEvent.click(await screen.findByLabelText('Смета'))

    expect((await screen.findByText('Создать')).closest('button')?.disabled).toBe(true)
  })

  it('двоих — можно, и состав уходит именами профилей', async () => {
    listRooms.mockResolvedValue([])
    show()

    fireEvent.click(await screen.findByText('Новая комната'))
    fireEvent.click(await screen.findByLabelText('Смета'))
    fireEvent.click(await screen.findByLabelText('Электрика'))
    fireEvent.click(await screen.findByText('Создать'))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({ members: ['smeta', 'elektrika'] })
    )
  })
})

describe('цена вопроса', () => {
  it('сколько ответит — видно ДО отправки', async () => {
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))

    fireEvent.change(await screen.findByLabelText('Сообщение в комнату'), {
      target: { value: 'что скажете?' }
    })

    expect(await screen.findByText('ответят 3 из 3')).toBeTruthy()
  })

  it('адресный вопрос стоит меньше, и это тоже видно заранее', async () => {
    willAnswerInRoom.mockResolvedValue(['smeta'])
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))

    fireEvent.change(await screen.findByLabelText('Сообщение в комнату'), {
      target: { value: '@Смета посчитай' }
    })

    expect(await screen.findByText('ответят 1 из 3')).toBeTruthy()
  })
})

describe('почему тихо', () => {
  it('лента круга объясняет молчание', async () => {
    // Без неё комната, где двое думают, а один промолчал, выглядит зависшей —
    // и человек отправляет вопрос второй раз, платя за него дважды.
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))

    feed.forEach((cb) => cb({ room: 'к-1', member: 'gip', kind: 'passed', round: 1 }))

    fireEvent.click(await screen.findByText(/Что делает комната/))
    expect(await screen.findByText(/Главный инженер: нечего добавить/)).toBeTruthy()
  })

  it('чужая комната в ленту не попадает', async () => {
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))

    feed.forEach((cb) => cb({ room: 'другая', member: 'gip', kind: 'passed', round: 1 }))

    await waitFor(() => expect(screen.queryByText(/Что делает комната/)).toBeNull())
  })
})

describe('опоздавший ответ', () => {
  it('перечитывает переписку, когда он приходит после круга', async () => {
    // Опоздавший ложится в переписку сам, уже после конца круга. Окно узнаёт об
    // этом только из ленты: без перечитывания реплика есть, а на экране её нет
    // до следующего вопроса.
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))
    await screen.findByLabelText('Сообщение в комнату')

    roomTranscript.mockResolvedValue([{ from: 'smeta', text: 'считал долго: 12%' }])
    feed.forEach((cb) => cb({ room: 'к-1', member: 'smeta', kind: 'answered', round: 1 }))

    expect(await screen.findByText('считал долго: 12%')).toBeTruthy()
  })
})

describe('имя комнаты', () => {
  it('правится на месте и не трогает сессии участников', async () => {
    // Имя — подпись, а не адрес: менять из-за него разговор было бы подменой.
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))

    const box = await screen.findByLabelText('Имя комнаты')
    fireEvent.blur(box, { target: { value: 'Совещание по разделу 5' } })

    await waitFor(() =>
      expect(editRoom).toHaveBeenCalledWith({ id: 'к-1', title: 'Совещание по разделу 5' })
    )
  })

  it('то же имя записью не считается', async () => {
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))

    fireEvent.blur(await screen.findByLabelText('Имя комнаты'), {
      target: { value: 'Раздел 5' }
    })

    expect(editRoom).not.toHaveBeenCalled()
  })
})

describe('отправка', () => {
  it('Enter отправляет, Shift+Enter — нет', async () => {
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))
    const box = await screen.findByLabelText('Сообщение в комнату')

    fireEvent.change(box, { target: { value: 'вопрос' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(askRoom).not.toHaveBeenCalled()

    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(askRoom).toHaveBeenCalledWith({ id: 'к-1', text: 'вопрос' }))
  })

  it('пустое сообщение никого не будит', async () => {
    show()
    fireEvent.click(await screen.findByText('Раздел 5'))
    const box = await screen.findByLabelText('Сообщение в комнату')

    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(askRoom).not.toHaveBeenCalled()
  })
})
