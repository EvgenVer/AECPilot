import { describe, expect, test } from 'vitest'
import { channelBeingEnabled, CHANNEL_DISCLOSURE_ITEMS } from './disclosure-pure'

/**
 * Task 3.10. The guard sits on a route their screen also uses for harmless
 * writes, so the cases that matter are the ones it must NOT interrupt: turning
 * a channel off, saving credentials, testing a connection.
 */

describe('channelBeingEnabled', () => {
  test('включение канала распознаётся', () => {
    expect(
      channelBeingEnabled({
        path: '/api/messaging/platforms/telegram',
        method: 'PUT',
        body: { enabled: true }
      })
    ).toBe('telegram')
  })

  test('выключение не перехватывается — предупреждать не о чем', () => {
    expect(
      channelBeingEnabled({
        path: '/api/messaging/platforms/telegram',
        method: 'PUT',
        body: { enabled: false }
      })
    ).toBeNull()
  })

  test('сохранение настроек без включения не перехватывается', () => {
    expect(
      channelBeingEnabled({
        path: '/api/messaging/platforms/ntfy',
        method: 'PUT',
        body: { env: { NTFY_TOPIC: 'hermes-in' } }
      })
    ).toBeNull()
  })

  test('соседние маршруты не задеваются', () => {
    for (const request of [
      { path: '/api/messaging/platforms', method: 'GET' },
      { path: '/api/messaging/platforms/telegram/test', method: 'POST', body: { enabled: true } },
      { path: '/api/messaging/pairing', method: 'PUT', body: { enabled: true } },
      { path: '/api/audio/speak', method: 'POST', body: { enabled: true } }
    ]) {
      expect(channelBeingEnabled(request), request.path).toBeNull()
    }
  })

  test('мусор вместо тела не роняет проверку', () => {
    for (const body of [undefined, null, 'enabled', 42, [], { enabled: 'true' }, { enabled: 1 }]) {
      expect(
        channelBeingEnabled({ path: '/api/messaging/platforms/x', method: 'PUT', body })
      ).toBeNull()
    }
  })

  test('идентификатор канала возвращается расшифрованным', () => {
    expect(
      channelBeingEnabled({
        path: '/api/messaging/platforms/wecom%5Fcallback',
        method: 'PUT',
        body: { enabled: true }
      })
    ).toBe('wecom_callback')
  })
})

describe('CHANNEL_DISCLOSURE_ITEMS', () => {
  test('три последствия R10 на месте', () => {
    // Список — это то, ради чего задача существует: если из него молча пропадёт
    // строка, экран станет выглядеть законно, а человек не узнает главного.
    expect([...CHANNEL_DISCLOSURE_ITEMS]).toEqual([
      'channels.disclosure.conversation',
      'channels.disclosure.files',
      'channels.disclosure.remoteStart'
    ])
  })
})
