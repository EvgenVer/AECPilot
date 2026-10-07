// Задачи 5.4 и 5.16 — что экран памяти делает руками человека.
//
// Проверяется не вид, а то, без чего экран бесполезен или опасен: правка доезжает
// до главного процесса ТЕМ ЖЕ текстом; отказ ядра виден словами, а не проглочен;
// переключатель автозаписи доходит до главного процесса. Задача 3H.8: окно стало
// страницей, факты — первая вкладка, записка — вторая. Задача 3H.21: список
// читается при входе, без остановки агента, и число фактов уходит на строку
// «Память» боковой панели.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MemoryFact } from '../../../../shared/ipc'
import { $freshSessionRequest } from '../../donor/store/profile'
import { AecI18nProvider } from '../../shared/i18n'

import MemoryPage from './MemoryPage'
import { $memoryFacts, $memoryFactsCount, $memoryNotes, EMPTY, FACTS_IDLE } from './store'

const writes: { target: string; content: string }[] = []
const toggles: boolean[] = []
const deletes: string[] = []
let refusal = ''
let reads = 0
let deleteRefusal = ''
let factsAnswer: unknown = null

const FACTS: MemoryFact[] = [
  {
    channel: 'tui',
    created_at: '2026-09-01T08:00:00+00:00',
    id: 'f-1',
    text: 'Резерв мощности на объекте: 20%.'
  },
  {
    channel: '',
    created_at: '2026-09-02T09:30:00+00:00',
    id: 'f-2',
    text: 'Срок сдачи раздела ОВ — 20 мая.'
  }
]

const NOTES = {
  user: 'Ведёт раздел ОВ.',
  memory: 'Проект на диске D.',
  limits: EMPTY.limits,
  autowrite: true
}

let unmountPage: () => void = () => undefined

function show(): void {
  unmountPage = render(
    <AecI18nProvider>
      <MemoryPage />
    </AecI18nProvider>
  ).unmount
}

/** Вкладка «Записки»: записка ядра живёт второй вкладкой, факты — первой. */
async function showNotes(): Promise<void> {
  show()
  fireEvent.click(screen.getAllByText('Записки')[0])
  await waitFor(() => expect(userBox().value).toBe(NOTES.user))
}

beforeEach(() => {
  writes.length = 0
  toggles.length = 0
  deletes.length = 0
  refusal = ''
  reads = 0
  deleteRefusal = ''
  factsAnswer = { facts: FACTS, ok: true, userId: 'project-aaaa1111' }
  $memoryFacts.set(FACTS_IDLE)
  $memoryFactsCount.set(null)
  $memoryNotes.set(EMPTY)
  ;(window as unknown as { aecpilot: unknown }).aecpilot = {
    // Страница читает записку сама при каждом входе.
    readMemoryNotes: () => Promise.resolve({ ok: true, ...NOTES }),
    writeMemoryNote: (target: string, content: string) => {
      writes.push({ target, content })
      return Promise.resolve(refusal ? { ok: false, error: refusal } : { ok: true })
    },
    setMemoryAutowrite: (enabled: boolean) => {
      toggles.push(enabled)
      return Promise.resolve({ ok: true, autowrite: enabled })
    },
    readMemoryFacts: () => {
      reads += 1
      return Promise.resolve(factsAnswer)
    },
    deleteMemoryFact: (id: string) => {
      deletes.push(id)
      return Promise.resolve(deleteRefusal ? { ok: false, error: deleteRefusal } : { ok: true })
    }
  }
})

afterEach(() => {
  // Руками, а не автоматикой: у проекта `dom` не включён `globals`, и
  // `@testing-library/react` свою автоочистку не вешает. Без этой строки DOM
  // предыдущего теста остаётся, и поиск по надписи находит её дважды.
  cleanup()
  $memoryNotes.set(EMPTY)
  $memoryFacts.set(FACTS_IDLE)
})

const userBox = (): HTMLTextAreaElement =>
  screen.getByLabelText('Записка о вас') as HTMLTextAreaElement

const showList = async (): Promise<void> => {
  show()
  await waitFor(() => expect(screen.getByText(/Фактов в этом проекте/)).toBeTruthy())
}

describe('экран памяти', () => {
  it('показывает записку текстом и считает знаки против предела', async () => {
    await showNotes()

    expect(userBox().value).toBe('Ведёт раздел ОВ.')
    expect(screen.getByText(`16 из ${EMPTY.limits.user} знаков`)).toBeTruthy()
  })

  it('сохраняет ровно тот текст, который набрали', async () => {
    await showNotes()
    fireEvent.change(userBox(), { target: { value: 'Ведёт ОВ и ВК. Отвечать коротко.' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Сохранить' })[0])

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({ target: 'user', content: 'Ведёт ОВ и ВК. Отвечать коротко.' })
  })

  it('кнопка спит, пока текст не изменён — нечего сохранять', async () => {
    await showNotes()
    const save = screen.getAllByRole('button', { name: 'Сохранить' })[0] as HTMLButtonElement

    expect(save.disabled).toBe(true)
  })

  it('отказ ядра виден словами, а не проглочен', async () => {
    refusal = 'Записка длиннее предела ядра: 9000 знаков против 1375.'
    await showNotes()
    fireEvent.change(userBox(), { target: { value: 'я'.repeat(9000) } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Сохранить' })[0])

    await waitFor(() => expect(screen.getByText(refusal)).toBeTruthy())
  })

  it('переключатель автозаписи доходит до главного процесса', async () => {
    await showNotes()
    fireEvent.click(screen.getByLabelText('Разрешить агенту пополнять память самому'))

    await waitFor(() => expect(toggles).toEqual([false]))
  })
})

describe('список фактов памяти проекта', () => {
  it('читается сразу при входе — агента гасить не нужно (3H.21)', async () => {
    await showList()

    expect(reads).toBe(1)
    expect(screen.getByText('Резерв мощности на объекте: 20%.')).toBeTruthy()
    expect(screen.getByText('Срок сдачи раздела ОВ — 20 мая.')).toBeTruthy()
    expect(screen.getByText('Фактов в этом проекте: 2')).toBeTruthy()
    expect(screen.queryByText(/остановлен/i)).toBeNull()
    expect($memoryFactsCount.get()).toBe(2)
  })

  it('поиск отбирает по тексту факта', async () => {
    await showList()
    fireEvent.change(screen.getByLabelText('Поиск по фактам'), { target: { value: 'резерв' } })

    expect(screen.getByText('Резерв мощности на объекте: 20%.')).toBeTruthy()
    expect(screen.queryByText('Срок сдачи раздела ОВ — 20 мая.')).toBeNull()
  })

  it('удаление уходит с тем же id, и строка исчезает только после подтверждения', async () => {
    await showList()
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[1])

    await waitFor(() => expect(deletes).toEqual(['f-2']))
    await waitFor(() => expect(screen.queryByText('Срок сдачи раздела ОВ — 20 мая.')).toBeNull())
    expect(screen.getByText('Резерв мощности на объекте: 20%.')).toBeTruthy()
    expect($memoryFactsCount.get()).toBe(1)
  })

  it('отказ в удалении оставляет факт на месте и виден словами', async () => {
    deleteRefusal = 'Факт не удалён: хранилище ответило отказом'
    await showList()
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[0])

    await waitFor(() => expect(screen.getByText(deleteRefusal)).toBeTruthy())
    expect(screen.getByText('Резерв мощности на объекте: 20%.')).toBeTruthy()
  })

  it('«занято» сказано нашими словами, а не чужой строкой про Qdrant', async () => {
    factsAnswer = {
      busy: true,
      error:
        'RuntimeError: Mem0 backend not initialized: Storage folder … is already accessed by another instance of Qdrant client.',
      ok: false
    }
    show()

    await waitFor(() => expect(screen.getByText(/Хранилище занято/)).toBeTruthy())
    expect(screen.queryByText(/Qdrant client/)).toBeNull()
  })

  it('неудачное чтение повторяется кнопкой', async () => {
    factsAnswer = { busy: false, error: 'Читатель памяти не ответил', ok: false }
    show()
    await waitFor(() => expect(screen.getByText('Читатель памяти не ответил')).toBeTruthy())

    factsAnswer = { facts: FACTS, ok: true, userId: 'project-aaaa1111' }
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    await waitFor(() => expect(screen.getByText('Фактов в этом проекте: 2')).toBeTruthy())
    expect(reads).toBe(2)
  })

  it('«Обновить» перечитывает список: агент пишет и пока страница открыта', async () => {
    await showList()
    factsAnswer = { facts: FACTS.slice(0, 1), ok: true, userId: 'project-aaaa1111' }
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))

    await waitFor(() => expect(screen.getByText('Фактов в этом проекте: 1')).toBeTruthy())
    expect($memoryFactsCount.get()).toBe(1)
  })

  // D-161: удалённый факт фоновый разбор ядра записал бы снова из прежнего разговора.
  it('после удаления факта уход со страницы открывает новый сеанс', async () => {
    const before = $freshSessionRequest.get()
    await showList()
    fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' })[0])
    await waitFor(() => expect(deletes).toEqual(['f-1']))
    act(() => unmountPage())

    expect($freshSessionRequest.get()).toBe(before + 1)
  })

  it('без удаления прежний разговор продолжается', async () => {
    const before = $freshSessionRequest.get()
    await showList()
    act(() => unmountPage())

    expect($freshSessionRequest.get()).toBe(before)
  })

  it('факты — первая вкладка: «запомни» пишет туда, и искать сказанное будут там (D-190)', async () => {
    await showList()

    expect(screen.queryByLabelText('Записка о вас')).toBeNull()
  })
})
