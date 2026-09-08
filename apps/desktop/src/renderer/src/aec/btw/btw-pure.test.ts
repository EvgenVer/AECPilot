import { describe, expect, it } from 'vitest'

import { btwParams, checkQuestion, isAnswerFor, readAnswer } from './btw-pure'

// Форма события взята с ЖИВОГО ядра 0.21.0 (проба задачи 3.B3ж), а не из
// чтения исходников: поля лежат в `payload`, и кадр целиком выглядит так —
// {"type":"btw.complete","session_id":"a4e4f806",
//  "payload":{"task_id":"btw_b25804","question":"…","text":"подтверждение"},
//  "seq":12}
const complete = (payload: Record<string, unknown>) => ({
  type: 'btw.complete',
  session_id: 's-1',
  payload
})

describe('побочный вопрос: проверка вопроса', () => {
  it('пустой и пробельный не отправляются', () => {
    // Ядро отклоняет такой вопрос кодом 4012 («text required») — проверено
    // вызовом. Показать человеку отказ шлюза вместо неактивной кнопки хуже.
    expect(checkQuestion('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkQuestion('   \n\t ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('обычный обрезается по краям и проходит', () => {
    expect(checkQuestion('  на чём мы остановились? ')).toEqual({
      ok: true,
      text: 'на чём мы остановились?'
    })
  })
})

describe('побочный вопрос: параметры', () => {
  it('сессия уходит вместе с текстом — без неё ядру нечего снимать', () => {
    expect(btwParams('s-1', 'вопрос')).toEqual({ session_id: 's-1', text: 'вопрос' })
  })
})

describe('побочный вопрос: разбор события', () => {
  it('ответ на ЧУЖУЮ задачу не принимается', () => {
    const event = complete({ task_id: 'btw_aaa', text: 'ответ' })

    expect(isAnswerFor(event, 'btw_bbb')).toBe(false)
    expect(isAnswerFor(event, 'btw_aaa')).toBe(true)
  })

  it('другое событие с тем же полем не принимается', () => {
    expect(
      isAnswerFor({ type: 'message.complete', payload: { task_id: 'btw_aaa' } }, 'btw_aaa')
    ).toBe(false)
  })

  it('поля читаются из payload, а не из корня кадра', () => {
    // Первая редакция модуля читала их плоско. Тест держит измеренную форму:
    // кадр с полями в корне ответом не считается.
    expect(isAnswerFor({ type: 'btw.complete', payload: null }, 'btw_aaa')).toBe(false)
    expect(readAnswer({ type: 'btw.complete', payload: null })).toEqual({ text: '', failed: false })
  })

  it('ответ читается как ответ', () => {
    expect(readAnswer(complete({ task_id: 'btw_aaa', text: 'мы на разделе ЭОМ' }))).toEqual({
      text: 'мы на разделе ЭОМ',
      failed: false
    })
  })

  it('сбой ядра распознаётся, а не выдаётся за ответ модели', () => {
    // Ядро шлёт ОДНО И ТО ЖЕ событие и на успех, и на исключение, кладя в
    // `text` строку `error: …`. Без этой ветки человек прочитал бы стек как
    // ответ.
    expect(readAnswer(complete({ task_id: 'btw_aaa', text: 'error: boom' }))).toEqual({
      text: 'boom',
      failed: true
    })
  })

  it('пустой и нестроковый text не роняют разбор', () => {
    expect(readAnswer(complete({ task_id: 'btw_aaa' }))).toEqual({ text: '', failed: false })
    expect(readAnswer(complete({ task_id: 'btw_aaa', text: 42 }))).toEqual({
      text: '',
      failed: false
    })
  })
})
