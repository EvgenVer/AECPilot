// Находка D-39. Проверяется то, ради чего это вообще написано: при холодном
// возврате к старой сессии человек не должен смотреть на пустое окно без
// объяснения — и не должен остаться с извещением, которое уже неправда.

import { describe, expect, it } from 'vitest'

import { resumeNoticeAction, resumeNoticeId } from './resume-progress-pure'

/** Конверт события ровно в той форме, в какой его шлёт ядро
 * (`_schedule_resume_hydration`, `tui_gateway/server.py`). */
const event = (status: string, extra: Record<string, unknown> = {}): unknown => ({
  type: 'session.resume_progress',
  session_id: 'sess-1',
  payload: { phase: 'history', status, ...extra }
})

describe('извещение о подгрузке истории (находка D-39)', () => {
  it('загрузка началась — извещение показывается', () => {
    expect(resumeNoticeAction(event('loading'))).toEqual({
      kind: 'show',
      id: resumeNoticeId('sess-1')
    })
  })

  it('история доехала — извещение снимается', () => {
    expect(resumeNoticeAction(event('complete', { message_count: 42 }))).toEqual({
      kind: 'hide',
      id: resumeNoticeId('sess-1')
    })
  })

  it('загрузка провалилась — тоже снимается, объяснение даёт их разбор `error`', () => {
    expect(resumeNoticeAction(event('failed', { message: 'resume failed: boom' }))).toEqual({
      kind: 'hide',
      id: resumeNoticeId('sess-1')
    })
  })

  it('показ и снятие адресуются одним id — снимать нечего помнить', () => {
    const shown = resumeNoticeAction(event('loading'))
    const hidden = resumeNoticeAction(event('complete'))

    expect(shown && 'id' in shown && shown.id).toBe(hidden && 'id' in hidden && hidden.id)
  })

  it('у разных сессий извещения разные', () => {
    expect(resumeNoticeId('sess-1')).not.toBe(resumeNoticeId('sess-2'))
  })

  it('чужое событие не трогается', () => {
    expect(resumeNoticeAction({ type: 'message.complete', session_id: 'sess-1' })).toBeUndefined()
  })

  it('незнакомое состояние молчит, а не выдумывает текст', () => {
    expect(resumeNoticeAction(event('rehydrating'))).toBeUndefined()
    expect(
      resumeNoticeAction({ type: 'session.resume_progress', session_id: 'sess-1' })
    ).toBeUndefined()
  })

  it('событие без сессии не адресуется никому', () => {
    expect(
      resumeNoticeAction({ type: 'session.resume_progress', payload: { status: 'loading' } })
    ).toBeUndefined()
    expect(resumeNoticeAction(undefined)).toBeUndefined()
  })
})
