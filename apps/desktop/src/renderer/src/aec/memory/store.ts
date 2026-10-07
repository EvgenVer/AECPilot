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

// --- Факты памяти проекта (задачи 5.16, 3H.21) ----------------------------
//
// СПИСОК ЧИТАЕТСЯ СРАЗУ, АГЕНТ НЕ ГАСИТСЯ. До 3H.21 между «не просили» и «список
// открыт» стояла остановка ядра; теперь список отдаёт команда живого ядра
// (specs/agent-memory.md, замер 3H.20), и состояние — обычное «читаю / есть /
// отказ».

export interface MemoryFactsView {
  /** Хранилище занято — ядро ещё запускается. Отдельно от прочих отказов: это
   *  проходит само, а не поломка. */
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

/** Сколько фактов у проекта — для строки «Память» боковой панели (3H.21).
 *  `null` — ещё не читали: строка тогда без числа, а не с нулём, которого нет. */
export const $memoryFactsCount = atom<null | number>(null)

// D-161 (решение владельца 2026-09-30). Удалённый факт возвращается, если
// продолжить разговор, где он прозвучал: фоновый разбор хода у ядра видит всю
// историю и пишет его в память снова. Поэтому после удаления, уходя со страницы,
// человек попадает в НОВЫЙ сеанс; прежняя переписка остаётся в истории.
let factDeleted = false

export async function loadMemoryFacts(): Promise<void> {
  $memoryFacts.set({ ...$memoryFacts.get(), busy: false, error: '', state: 'reading' })

  const answer = await window.aecpilot.readMemoryFacts()
  if (answer.ok) {
    $memoryFacts.set({ busy: false, error: '', facts: answer.facts, state: 'open' })
    $memoryFactsCount.set(answer.facts.length)
  } else {
    $memoryFacts.set({ busy: answer.busy, error: answer.error, facts: [], state: 'failed' })
  }
}

/** Только число — после хода агента, без страницы. Отказ молчит: строка
 *  остаётся с прежним числом, а причину человек увидит на самой странице. */
export async function refreshMemoryFactsCount(): Promise<void> {
  const answer = await window.aecpilot.readMemoryFacts()
  if (answer.ok) $memoryFactsCount.set(answer.facts.length)
}

/** Возвращает текст отказа или пустую строку. Из списка факт исчезает только
 *  после подтверждённого удаления: вычеркнуть строку раньше значило бы показать
 *  память, которой нет. */
export async function deleteMemoryFact(id: string): Promise<string> {
  const answer = await window.aecpilot.deleteMemoryFact(id)
  if (!answer.ok) return answer.error

  factDeleted = true
  const view = $memoryFacts.get()
  const facts = view.facts.filter((fact) => fact.id !== id)
  $memoryFacts.set({ ...view, facts })
  $memoryFactsCount.set(facts.length)
  return ''
}

/** Уход со страницы памяти. */
export function leaveMemoryFacts(): void {
  $memoryFacts.set(FACTS_IDLE)
  if (factDeleted) {
    factDeleted = false
    requestFreshSession()
  }
}
