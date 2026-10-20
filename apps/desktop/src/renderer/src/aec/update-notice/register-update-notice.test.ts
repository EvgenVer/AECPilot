// Задача T42. Окно показывает уведомление, только когда главный процесс назвал новую
// версию, и кнопка ведёт ссылку через политику внешних ссылок главного процесса.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const notify = vi.fn()

vi.mock('../../donor/store/notifications', () => ({ notify }))
vi.mock('../../donor/i18n/plugin-i18n', () => ({
  translatePlugin: (_ns: string, _locale: string, key: string) => key
}))
vi.mock('../../donor/i18n/runtime', () => ({ getRuntimeI18nLocale: () => 'ru' }))

const { registerUpdateNotice } = await import('./register-update-notice')

const checkForUpdate = vi.fn()
const openExternalLink = vi.fn()

beforeEach(() => {
  notify.mockReset()
  checkForUpdate.mockReset()
  openExternalLink.mockReset()
  vi.stubGlobal('window', { aecpilot: { checkForUpdate, openExternalLink } })
})

describe('уведомление о новой версии (T42)', () => {
  it('новая версия — уведомление с «Скачать», ссылка уходит главному процессу', async () => {
    checkForUpdate.mockResolvedValue({ version: '0.2.0', url: 'https://example.org/a.exe' })

    await registerUpdateNotice()

    const shown = notify.mock.calls[0][0]
    expect(shown.title).toBe('updateNotice.title')
    expect(shown.action.label).toBe('updateNotice.download')
    expect(shown.durationMs).toBe(0)

    shown.action.onClick()
    expect(openExternalLink).toHaveBeenCalledWith('https://example.org/a.exe')
  })

  it('нет новой версии, нет адреса или сети — молчание', async () => {
    checkForUpdate.mockResolvedValue(null)
    await registerUpdateNotice()

    checkForUpdate.mockRejectedValue(new Error('offline'))
    await registerUpdateNotice()

    expect(notify).not.toHaveBeenCalled()
  })
})
