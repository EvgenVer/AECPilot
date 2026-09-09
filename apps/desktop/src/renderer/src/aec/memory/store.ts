// Экран памяти: состояние записки и автозаписи (задача 5.4, спека agent-memory).
//
// ЧИТАЕТСЯ ПРИ ОТКРЫТИИ ОКНА, а не один раз при запуске: записку меняет не
// только человек — её пишет сам агент своим инструментом, и показывать ему
// устаревший текст значит предлагать затереть чужую правку.

import { atom } from 'nanostores'

export interface MemoryNotesView {
  /** Пусто — записки ещё нет; это обычное состояние чистого профиля. */
  memory: string
  user: string
  limits: { memory: number; user: number }
  autowrite: boolean
  /** Текст отказа, если прочитать не удалось. Пусто — всё в порядке. */
  error: string
}

export const EMPTY: MemoryNotesView = {
  memory: '',
  user: '',
  limits: { memory: 2200, user: 1375 },
  autowrite: true,
  error: ''
}

export const $memoryNotes = atom<MemoryNotesView>(EMPTY)
export const $memoryOpen = atom<boolean>(false)

export async function refreshMemoryNotes(): Promise<MemoryNotesView> {
  const answer = await window.aecpilot.readMemoryNotes()
  const view: MemoryNotesView = answer.ok
    ? {
        memory: answer.memory,
        user: answer.user,
        limits: answer.limits,
        autowrite: answer.autowrite,
        error: ''
      }
    : { ...EMPTY, error: answer.error }

  $memoryNotes.set(view)
  return view
}

/** Возвращает текст отказа или пустую строку. Отказ показывается человеку
 *  словами: предел записки — это не ошибка программы, а решение, которое он
 *  должен увидеть и поправить сам. */
export async function saveMemoryNote(target: 'memory' | 'user', content: string): Promise<string> {
  const answer = await window.aecpilot.writeMemoryNote(target, content)
  if (!answer.ok) return answer.error

  $memoryNotes.set({ ...$memoryNotes.get(), [target]: content, error: '' })
  return ''
}

export async function setAutowrite(enabled: boolean): Promise<string> {
  const answer = await window.aecpilot.setMemoryAutowrite(enabled)
  if (!answer.ok) return answer.error

  $memoryNotes.set({ ...$memoryNotes.get(), autowrite: answer.autowrite, error: '' })
  return ''
}
