// Находка D-39, вторая половина: не решение, а ПОРОГ.
//
// Замер на живом ядре показал, что у обычной сессии `loading` и `complete`
// приходят подряд. Без порога извещение мигало бы при каждом возврате, и
// находку про необъяснённое пустое окно закрыла бы новая помеха.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn()
const dismissNotification = vi.fn()

vi.mock('../../donor/store/notifications', () => ({ notify, dismissNotification }))
vi.mock('../../donor/i18n/plugin-i18n', () => ({
  translatePlugin: (_ns: string, _locale: string, key: string) => key
}))
vi.mock('../../donor/i18n/runtime', () => ({ getRuntimeI18nLocale: () => 'ru' }))

let emit: (event: unknown) => void = () => {}
const unsubscribe = vi.fn()

vi.mock('../../shared/gateway-bridge', () => ({
  gatewayBridge: () => ({
    onEvent: (handler: (event: unknown) => void) => {
      emit = handler
      return unsubscribe
    }
  })
}))

const { registerResumeProgress } = await import('./register-resume-progress')

/** Конверт ровно в той форме, в какой он ЗАМЕРЕН на живом ядре 24.08:
 * `{"type":"session.resume_progress","session_id":"679ac3f6",
 *   "payload":{"phase":"history","status":"loading"}}` */
const event = (status: string, extra: Record<string, unknown> = {}): unknown => ({
  type: 'session.resume_progress',
  session_id: '679ac3f6',
  payload: { phase: 'history', status, ...extra }
})

let stop: () => void

beforeEach(() => {
  vi.useFakeTimers()
  notify.mockReset()
  dismissNotification.mockReset()
  unsubscribe.mockReset()
  stop = registerResumeProgress()
})

describe('извещение о подгрузке истории (находка D-39)', () => {
  it('быстрый возврат проходит молча — мигания нет', () => {
    emit(event('loading'))
    vi.advanceTimersByTime(100)
    emit(event('complete', { message_count: 2 }))
    vi.advanceTimersByTime(5000)

    expect(notify, 'человек ничего не ждал — и объяснять нечего').not.toHaveBeenCalled()
  })

  it('затянувшийся возврат объясняется — и объяснение не тает само', () => {
    emit(event('loading'))
    vi.advanceTimersByTime(5000)

    expect(notify).toHaveBeenCalledTimes(1)
    const shown = notify.mock.calls[0][0]
    expect(shown.message).toBe('resumeProgress.loading')
    expect(shown.durationMs, 'пропасть должно по событию, а не по таймеру').toBe(0)
  })

  it('история доехала — извещение снимается', () => {
    emit(event('loading'))
    vi.advanceTimersByTime(5000)
    emit(event('complete', { message_count: 900 }))

    expect(dismissNotification).toHaveBeenCalledWith(notify.mock.calls[0][0].id)
  })

  it('провал тоже снимает: объяснение даёт их разбор `error`', () => {
    emit(event('loading'))
    vi.advanceTimersByTime(5000)
    emit(event('failed', { message: 'resume failed: boom' }))

    expect(dismissNotification).toHaveBeenCalledTimes(1)
    expect(notify, 'второго сообщения об одном и том же не будет').toHaveBeenCalledTimes(1)
  })

  it('две сессии подгружаются одновременно, не мешая друг другу', () => {
    emit({ type: 'session.resume_progress', session_id: 'a', payload: { status: 'loading' } })
    emit({ type: 'session.resume_progress', session_id: 'b', payload: { status: 'loading' } })
    vi.advanceTimersByTime(5000)
    emit({ type: 'session.resume_progress', session_id: 'a', payload: { status: 'complete' } })

    expect(notify).toHaveBeenCalledTimes(2)
    expect(dismissNotification).toHaveBeenCalledTimes(1)
    expect(dismissNotification).toHaveBeenCalledWith(notify.mock.calls[0][0].id)
  })

  it('отписка снимает и ещё не сработавший показ', () => {
    emit(event('loading'))
    stop()
    vi.advanceTimersByTime(5000)

    expect(unsubscribe).toHaveBeenCalled()
    expect(notify, 'окна уже нет — показывать некому').not.toHaveBeenCalled()
  })
})
