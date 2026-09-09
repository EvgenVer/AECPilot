// Задача 5.4 — что экран памяти делает руками человека.
//
// Проверяется не вид, а три вещи, без которых экран бесполезен или опасен:
// правка доезжает до главного процесса ТЕМ ЖЕ текстом; отказ ядра виден словами,
// а не проглочен; переключатель автозаписи доходит до главного процесса.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AecI18nProvider } from '../../shared/i18n'

import MemoryDialog from './MemoryDialog'
import { $memoryNotes, $memoryOpen, EMPTY } from './store'

const writes: { target: string; content: string }[] = []
const toggles: boolean[] = []
let refusal = ''

function show(): void {
  render(
    <AecI18nProvider>
      <MemoryDialog />
    </AecI18nProvider>
  )
}

beforeEach(() => {
  writes.length = 0
  toggles.length = 0
  refusal = ''
  $memoryOpen.set(true)
  $memoryNotes.set({
    ...EMPTY,
    user: 'Ведёт раздел ОВ.',
    memory: 'Проект на диске D.',
    autowrite: true
  })
  ;(window as unknown as { aecpilot: unknown }).aecpilot = {
    writeMemoryNote: (target: string, content: string) => {
      writes.push({ target, content })
      return Promise.resolve(refusal ? { ok: false, error: refusal } : { ok: true })
    },
    setMemoryAutowrite: (enabled: boolean) => {
      toggles.push(enabled)
      return Promise.resolve({ ok: true, autowrite: enabled })
    }
  }
})

afterEach(() => {
  // Руками, а не автоматикой: у проекта `dom` не включён `globals`, и
  // `@testing-library/react` свою автоочистку не вешает. Без этой строки DOM
  // предыдущего теста остаётся, и поиск по надписи находит её дважды.
  cleanup()
  $memoryOpen.set(false)
  $memoryNotes.set(EMPTY)
})

const userBox = (): HTMLTextAreaElement =>
  screen.getByLabelText('Записка о вас') as HTMLTextAreaElement

describe('экран памяти', () => {
  it('показывает записку текстом и считает знаки против предела', () => {
    show()

    expect(userBox().value).toBe('Ведёт раздел ОВ.')
    expect(screen.getByText(`16 из ${EMPTY.limits.user} знаков`)).toBeTruthy()
  })

  it('сохраняет ровно тот текст, который набрали', async () => {
    show()
    fireEvent.change(userBox(), { target: { value: 'Ведёт ОВ и ВК. Отвечать коротко.' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Сохранить' })[0])

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual({ target: 'user', content: 'Ведёт ОВ и ВК. Отвечать коротко.' })
  })

  it('кнопка спит, пока текст не изменён — нечего сохранять', () => {
    show()
    const save = screen.getAllByRole('button', { name: 'Сохранить' })[0] as HTMLButtonElement

    expect(save.disabled).toBe(true)
  })

  it('отказ ядра виден словами, а не проглочен', async () => {
    refusal = 'Записка длиннее предела ядра: 9000 знаков против 1375.'
    show()
    fireEvent.change(userBox(), { target: { value: 'я'.repeat(9000) } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Сохранить' })[0])

    await waitFor(() => expect(screen.getByText(refusal)).toBeTruthy())
  })

  it('переключатель автозаписи доходит до главного процесса', async () => {
    show()
    fireEvent.click(screen.getByLabelText('Разрешить агенту пополнять память самому'))

    await waitFor(() => expect(toggles).toEqual([false]))
  })

  it('про отсутствующий список фактов сказано прямо', () => {
    // Требование спеки тут не выполнено, и экран обязан сказать это человеку, а
    // не промолчать: молчание читается как «фактов нет».
    show()

    expect(screen.getByText(/не может её прочитать, пока агент работает/)).toBeTruthy()
  })
})
