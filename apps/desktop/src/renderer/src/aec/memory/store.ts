// Экран памяти: состояние записки и автозаписи (задача 5.4, спека agent-memory).
//
// ЧИТАЕТСЯ ПРИ ОТКРЫТИИ СТРАНИЦЫ, а не один раз при запуске: записку меняет не
// только человек — её пишет сам агент своим инструментом, и показывать ему
// устаревший текст значит предлагать затереть чужую правку.

import { atom } from 'nanostores'

import type { MemoryFact } from '../../../../shared/ipc'
import { requestFreshSession } from '../../donor/store/profile'
import { MEMORY_PAGE, openWorkspacePage } from '../workspace-pages'

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

/** Открыть страницу «Память агента» — значок строки состояния, пункт «Настроек»
 * (D-180) и строка Ctrl+K. Записку страница читает сама при входе (3H.10). */
export function openMemoryScreen(): void {
  openWorkspacePage(MEMORY_PAGE)
}

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

// --- Факты памяти проекта (задача 5.16) ------------------------------------
//
// ПОЧЕМУ СОСТОЯНИЕ ЧЕТЫРЁХЧАСТНОЕ, А НЕ «ЕСТЬ СПИСОК / НЕТ СПИСКА». Между
// «не просили» и «список открыт» стоит остановка ядра: человек должен видеть,
// что она идёт, а отказ после неё означает, что агент УЖЕ погашен — и его надо
// поднять, а не просто показать сообщение.

export interface MemoryFactsView {
  /** Хранилище занято живым ядром. Отдельно от прочих отказов: это поправимо
   *  человеком, а не поломка. */
  busy: boolean
  error: string
  facts: MemoryFact[]
  state: 'failed' | 'idle' | 'open' | 'reading'
}

export const FACTS_IDLE: MemoryFactsView = {
  busy: false,
  error: '',
  facts: [],
  state: 'idle'
}

export const $memoryFacts = atom<MemoryFactsView>(FACTS_IDLE)

// D-161 (решение владельца 2026-09-30). Удалённый факт возвращается, если
// продолжить разговор, где он прозвучал: фоновый разбор хода у ядра видит всю
// историю и пишет его в память снова. Поэтому после удаления агент поднимается
// в НОВОМ сеансе; прежняя переписка остаётся в истории.
let factDeleted = false

/** Гасит агента и читает хранилище. Цену человек видит до нажатия — текстом
 *  рядом с кнопкой. */
export async function openMemoryFacts(): Promise<void> {
  $memoryFacts.set({ ...FACTS_IDLE, state: 'reading' })
  factDeleted = false

  const answer = await window.aecpilot.readMemoryFacts()
  $memoryFacts.set(
    answer.ok
      ? { busy: false, error: '', facts: answer.facts, state: 'open' }
      : { busy: answer.busy, error: answer.error, facts: [], state: 'failed' }
  )
}

/** Возвращает текст отказа или пустую строку. Из списка факт исчезает только
 *  после подтверждённого удаления: вычеркнуть строку раньше значило бы показать
 *  память, которой нет. */
export async function deleteMemoryFact(id: string): Promise<string> {
  const answer = await window.aecpilot.deleteMemoryFact(id)
  if (!answer.ok) return answer.error

  factDeleted = true
  const view = $memoryFacts.get()
  $memoryFacts.set({ ...view, facts: view.facts.filter((fact) => fact.id !== id) })
  return ''
}

/** Поднимает агента обратно. Зовётся и кнопкой «закрыть список», и закрытием
 *  окна — в том числе когда список прочитать не удалось: ядро к этому моменту
 *  уже погашено, и молча оставить его погашенным нельзя. */
export async function closeMemoryFacts(): Promise<string> {
  if ($memoryFacts.get().state === 'idle') return ''

  // Список уходит ПОСЛЕ ответа, а не до: пока ядро поднимается, раздел
  // показывает «Поднимаю агента…», а не кнопку, которая остановила бы его
  // снова посреди подъёма (D-110).
  const answer = await window.aecpilot.closeMemoryFacts()
  $memoryFacts.set(FACTS_IDLE)
  if (factDeleted) {
    factDeleted = false
    requestFreshSession()
  }
  return answer.ok ? '' : answer.error
}
