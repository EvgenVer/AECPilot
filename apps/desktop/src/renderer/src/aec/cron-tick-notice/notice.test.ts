// Задача 3.6а. Проверяются три состояния запуска расписаний — потому что во
// всех трёх человек видит РАЗНОЕ, и перепутать их значит соврать: молчание там,
// где задача не сработает, или предложение включить то, что уже включено.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn()

vi.mock('../../donor/store/notifications', () => ({ notify }))
vi.mock('../../donor/i18n/plugin-i18n', () => ({
  translatePlugin: (_ns: string, _locale: string, key: string) => key
}))
vi.mock('../../donor/i18n/runtime', () => ({ getRuntimeI18nLocale: () => 'ru' }))

const setCronRunner = vi.fn()
let state = { enabled: false, running: false }

vi.mock('../cron-runner/store', () => ({
  $cronRunner: { get: () => state },
  setCronRunner: (on: boolean) => setCronRunner(on)
}))

const { noticeBotChatResult, noticeCronHasNoTick, resetCronTickNotice } = await import('./notice')

beforeEach(() => {
  notify.mockReset()
  setCronRunner.mockReset()
  resetCronTickNotice()
  state = { enabled: false, running: false }
})

describe('когда человек завёл задачу по расписанию', () => {
  it('запуск выключен — предлагаем включить, кнопкой прямо в уведомлении', () => {
    expect(noticeCronHasNoTick('create')).toBe(true)

    const shown = notify.mock.calls[0][0]
    expect(shown.kind).toBe('warning')
    expect(shown.title).toBe('cron.noTickTitle')
    expect(shown.action.label).toBe('cron.runner.enable')

    shown.action.onClick()
    expect(setCronRunner).toHaveBeenCalledWith(true)
  })

  it('запуск работает — молчим: обещание выполняется', () => {
    state = { enabled: true, running: true }

    expect(noticeCronHasNoTick('create')).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })

  it('включено, но процесса нет — это поломка, а не предложение', () => {
    state = { enabled: true, running: false }

    expect(noticeCronHasNoTick('create')).toBe(true)

    const shown = notify.mock.calls[0][0]
    expect(shown.kind).toBe('error')
    expect(shown.title).toBe('cron.runner.brokenTitle')
    expect(shown.action, 'включать нечего — оно уже включено').toBeUndefined()
  })

  it('чтение и удаление ложного ожидания не создают', () => {
    expect(noticeCronHasNoTick(null)).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })

  it('пять задач подряд — одна плашка, а не пять', () => {
    expect(noticeCronHasNoTick('create')).toBe(true)
    expect(noticeCronHasNoTick('create')).toBe(false)
    expect(noticeCronHasNoTick('resume')).toBe(false)
    expect(notify).toHaveBeenCalledTimes(1)
  })
})

// D-163: подсказка не зависит от состояния запуска — она про то, где виден результат.
describe('когда человек завёл рутину специалиста с доставкой в его чат', () => {
  it('говорит, что в открытом чате результат виден после реплики или переоткрытия', () => {
    state = { enabled: true, running: true }
    noticeBotChatResult()
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({
      kind: 'info',
      title: 'cron.botChatTitle',
      message: 'cron.botChatBody'
    })
  })

  it('пять рутин подряд — одна подсказка', () => {
    noticeBotChatResult()
    noticeBotChatResult()
    expect(notify).toHaveBeenCalledTimes(1)
  })
})
