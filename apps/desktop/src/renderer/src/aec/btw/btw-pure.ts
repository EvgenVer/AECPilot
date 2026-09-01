// Побочный вопрос по чату (задача 3.B3ж, метод ядра `prompt.btw`).
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ПОВЕРХНОСТЬ, А НЕ ЕЩЁ ОДНА КНОПКА В ЛЕНТЕ. Обычный вопрос
// становится ходом: он уходит в историю, сдвигает чередование ролей и рвёт кэш
// промпта. Иногда спросить надо ИМЕННО не трогая ветку — «а что тут вообще
// происходит», «на чём мы остановились», — и `prompt.btw` в 0.21.0 делает ровно
// это: снимает копию разговора, задаёт вопрос вспомогательной модели и отдаёт
// ответ событием. Ни одного следа в сессии не остаётся.
//
// Донор этот метод НЕ зовёт вовсе (проверено при подъёме: вызовов нет во всём
// `apps/desktop/src`), поэтому поверхность наша, и живёт она в `aec/**`.
//
// Здесь — чистая половина: проверка вопроса, форма параметров и разбор события.
// Всё, что можно проверить без шлюза, проверяется без шлюза.

/** Ответ ядра на `prompt.btw`. */
export interface BtwAccepted {
  task_id: string
}

/** Событие `btw.complete`, каким его шлёт ядро.
 *
 * Поля лежат в `payload`, а не в корне кадра, — ЗАМЕРЕНО на живом ядре
 * (проба задачи 3.B3ж), а не выведено из чтения. Первая редакция этого модуля
 * читала их плоско, и тесты на выдуманной форме проходили бы зелёными. */
export interface BtwCompleteEvent {
  type?: string
  session_id?: string
  /** Намеренно `unknown`, а не описанная форма: сюда приходит ЛЮБОЕ событие
   *  шлюза из общего канала, и сузить его — работа этого модуля, а не типа. */
  payload?: unknown
}

/** Поле payload'а как строка, если оно там есть. */
function payloadString(event: BtwCompleteEvent, key: 'task_id' | 'text'): string | null {
  const payload = event?.payload
  if (typeof payload !== 'object' || payload === null) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : null
}

export type QuestionCheck = { ok: true; text: string } | { ok: false; reason: 'empty' }

/** Вопрос перед отправкой.
 *
 * Пустую строку ядро отклоняет кодом 4012 («text required»), и это правильно —
 * но показать человеку отказ шлюза вместо неактивной кнопки было бы хуже.
 * Обрезка здесь та же, что у их проверки: пусто после `strip()` = пусто. */
export function checkQuestion(raw: string): QuestionCheck {
  const text = raw.trim()
  return text ? { ok: true, text } : { ok: false, reason: 'empty' }
}

/** Параметры вызова. Сессия обязательна: без неё ядро не знает, копию КАКОГО
 *  разговора снимать, и отвечает ошибкой сессии, а не вопроса. */
export function btwParams(sessionId: string, text: string): { session_id: string; text: string } {
  return { session_id: sessionId, text }
}

/** Наше ли это событие.
 *
 * Сверяется `task_id`, а не только тип: побочных вопросов может быть несколько
 * подряд, и ответ на прошлый не должен подменять ожидание текущего. */
export function isAnswerFor(event: BtwCompleteEvent, taskId: string): boolean {
  if (event?.type !== 'btw.complete') return false
  return payloadString(event, 'task_id') === taskId
}

export interface BtwAnswer {
  /** Текст ответа либо сообщения об ошибке. */
  text: string
  /** Ядро сообщило об ошибке, а не ответило. */
  failed: boolean
}

/** Разбор ответа.
 *
 * Ядро отвечает ОДНИМ И ТЕМ ЖЕ событием и на успех, и на сбой: при исключении
 * оно кладёт в `text` строку `error: …` (см. `methods_prompt.py`). Показывать
 * такую строку как ответ модели — врать; поэтому она распознаётся и подаётся
 * как отказ. Префикс их, и если он изменится, тест это заметит. */
export function readAnswer(event: BtwCompleteEvent): BtwAnswer {
  const text = payloadString(event, 'text') ?? ''
  if (text.startsWith('error: ')) {
    return { text: text.slice('error: '.length), failed: true }
  }
  return { text, failed: false }
}
