// Разбор ответа о фактах памяти проекта — без процессов и без IPC (задачи 5.16,
// 3H.21). Ответ одной формы приходит двумя путями: выводом команды ядра
// `/aec-memory-facts` и stdout отдельного процесса `runtime/memory-facts.py`.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ РАЗБОР ОТВЕТА. Читатель — процесс python, и на его stdout
// может прийти не только наша строка: их провайдер и qdrant пишут предупреждения
// и «Exception ignored» на выходе процесса. Берём ПОСЛЕДНЮЮ строку, которая
// разбирается как наш JSON, а не первую непустую.

import type { MemoryFact, MemoryFactsAnswer } from '../shared/ipc'

/** Слова qdrant о занятой папке. Проверяется подстрокой: полный текст несёт
 *  путь к хранилищу и хвост «Check that qdrant is running», а нам нужно одно —
 *  это занятость, а не поломка. */
const BUSY_MARK = 'already accessed by another instance'

function fact(value: unknown): MemoryFact | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id === '') return null
  return {
    channel: typeof row.channel === 'string' ? row.channel : '',
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    id: row.id,
    text: typeof row.text === 'string' ? row.text : ''
  }
}

/** Разбирает ответ команды ядра или `runtime/memory-facts.py`. Ни одна ветка не бросает: отказ —
 *  это такой же ответ, и человек увидит его словами. */
export function readFactsAnswer(stdout: string): MemoryFactsAnswer {
  let parsed: Record<string, unknown> | undefined

  for (const line of stdout.split('\n')) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    try {
      const candidate: unknown = JSON.parse(text)
      if (typeof candidate === 'object' && candidate !== null && 'ok' in candidate) {
        parsed = candidate as Record<string, unknown>
      }
    } catch {
      // не наша строка — у процесса python на stdout бывает и чужое
    }
  }

  if (!parsed) {
    return { busy: false, error: 'Читатель памяти не ответил', ok: false }
  }

  if (parsed.ok !== true) {
    const error = typeof parsed.error === 'string' ? parsed.error : 'Список фактов не прочитан'
    return { busy: error.includes(BUSY_MARK), error, ok: false }
  }

  const rows = Array.isArray(parsed.facts) ? parsed.facts : []
  return {
    facts: rows.map(fact).filter((row): row is MemoryFact => row !== null),
    ok: true,
    // Имя поля у читателя змеиное (`user_id`) — оно принадлежит mem0, а не нам.
    userId: typeof parsed.user_id === 'string' ? parsed.user_id : ''
  }
}
