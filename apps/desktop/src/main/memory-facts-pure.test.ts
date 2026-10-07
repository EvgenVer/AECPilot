// Задача 5.16 — что мы понимаем из ответа читателя памяти и когда отказываемся
// гасить ядро. Все строки отказов здесь ЗАМЕРЕНЫ на живом хранилище, а не
// придуманы: занятость папки приходит словами qdrant через их же провайдера.

import { describe, expect, it } from 'vitest'

import { readFactsAnswer } from './memory-facts-pure'

// Замер 2026-09-10: ровно это печатает `runtime/memory-facts.py list` на живом
// профиле, когда в хранилище один факт.
const LIST = `{"ok": true, "user_id": "project-76d066634e532794", "facts": [{"id": "727879e8-c042-4a31-a146-4809117e57cd", "text": "Срок сдачи раздела ОВ — 20 мая.", "created_at": "2026-09-10T10:13:58.073962+00:00", "channel": "tui"}]}`

// Замер там же, с занятой папкой: провайдер НЕ бросает, а отдаёт свою причину.
const BUSY = `{"ok": false, "error": "RuntimeError: Mem0 backend not initialized: Storage folder D:\\\\profile\\\\mem0_qdrant is already accessed by another instance of Qdrant client. If you require concurrent access, use Qdrant server instead.. Check that qdrant is running and reachable."}`

describe('чтение ответа читателя памяти', () => {
  it('отдаёт факты и ключ разделения проектов', () => {
    const answer = readFactsAnswer(LIST)

    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.userId).toBe('project-76d066634e532794')
    expect(answer.facts).toHaveLength(1)
    expect(answer.facts[0].text).toBe('Срок сдачи раздела ОВ — 20 мая.')
    expect(answer.facts[0].channel).toBe('tui')
  })

  it('занятую папку отличает от всякого другого отказа', () => {
    // Это не придирка к тексту: «занято» означает «ядро ещё живо» — поправимо
    // человеком, — а всё остальное означает поломку, и говорить о них одинаково
    // значит послать человека искать не там.
    const answer = readFactsAnswer(BUSY)

    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.busy).toBe(true)
  })

  it('поломку занятостью не объявляет', () => {
    const answer = readFactsAnswer('{"ok": false, "error": "ModuleNotFoundError: mem0"}')

    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.busy).toBe(false)
    expect(answer.error).toContain('mem0')
  })

  it('берёт НАШУ строку среди чужого вывода процесса', () => {
    // Живой замер: на выходе python бывает «Exception ignored in ...» от
    // qdrant_client и предупреждения провайдера. Первая непустая строка — не
    // наша, и разбор по ней потерял бы список целиком.
    const noisy = [
      'Mem0 backend failed to initialize (oss mode): ...',
      '{"not": "ours"}',
      LIST,
      'Exception ignored in: <function QdrantClient.__del__>'
    ].join('\n')

    const answer = readFactsAnswer(noisy)

    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.facts).toHaveLength(1)
  })

  it('молчание читателя — отказ, а не пустой список', () => {
    // Пустой список означает «памяти нет», и показать его вместо отказа значило
    // бы соврать про чистую память там, где мы просто ничего не узнали.
    const answer = readFactsAnswer('')

    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.error).toContain('не ответил')
  })

  it('факт без идентификатора отбрасывается: удалять его было бы нечем', () => {
    const answer = readFactsAnswer('{"ok": true, "facts": [{"text": "без id"}, {"id": "a"}]}')

    expect(answer.ok).toBe(true)
    if (!answer.ok) return
    expect(answer.facts.map((row) => row.id)).toEqual(['a'])
  })
})
