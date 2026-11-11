// D-163: подсказка о том, где виден результат рутины специалиста.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn()

vi.mock('../../donor/store/notifications', () => ({ notify }))
vi.mock('../../donor/i18n/plugin-i18n', () => ({
  translatePlugin: (_ns: string, _locale: string, key: string) => key
}))
vi.mock('../../donor/i18n/runtime', () => ({ getRuntimeI18nLocale: () => 'ru' }))

const { noticeBotChatResult, resetCronTickNotice } = await import('./notice')

beforeEach(() => {
  notify.mockReset()
  resetCronTickNotice()
})

describe('когда человек завёл рутину специалиста с доставкой в его чат', () => {
  it('говорит, что в открытом чате результат виден после реплики или переоткрытия', () => {
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
