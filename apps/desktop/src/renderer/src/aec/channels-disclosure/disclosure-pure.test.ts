import { describe, expect, it, test } from 'vitest'
import {
  channelBeingEnabled,
  CHANNEL_DISCLOSURE_ITEMS,
  CHANNEL_SHORTLIST,
  extraDisclosureItems,
  isPlatformListing,
  shortlistPlatforms
} from './disclosure-pure'

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

// Задача 3.11. A2A отличается от прочих каналов по существу: с той стороны не
// человек в переписке, а другая программа, и приходит она на сетевой порт.
describe('A2A говорит о себе отдельно', () => {
  it('к общим трём пунктам добавляются два своих', () => {
    expect(extraDisclosureItems('a2a')).toEqual([
      'channels.disclosure.a2aPort',
      'channels.disclosure.a2aSession'
    ])
  })

  it('прочим платформам ничего не добавляется — лишний текст никто не читает', () => {
    expect(extraDisclosureItems('telegram')).toEqual([])
    expect(extraDisclosureItems('')).toEqual([])
  })
})

// Задача 3.11 (решение владельца 2026-08-22). Ядро знает 33 канала; показываем
// те, за которые отвечаем. Главное правило — включённый канал не прячется.
describe('короткий список каналов', () => {
  const answer = {
    env_path: 'C:/profile/.env',
    platforms: [
      { id: 'telegram', enabled: false },
      { id: 'a2a', enabled: false },
      { id: 'webhook', enabled: false },
      { id: 'email', enabled: false },
      { id: 'weixin', enabled: false },
      { id: 'qqbot', enabled: false }
    ]
  }

  it('узнаётся именно запрос списка', () => {
    expect(isPlatformListing({ path: '/api/messaging/platforms' })).toBe(true)
    expect(isPlatformListing({ path: '/api/messaging/platforms?profile=второй' })).toBe(true)
    expect(isPlatformListing({ path: '/api/messaging/platforms/telegram' })).toBe(false)
    expect(isPlatformListing({ path: '/api/messaging/platforms', method: 'PUT' })).toBe(false)
  })

  it('остаются только те, за которые мы отвечаем', () => {
    const kept = (shortlistPlatforms(answer) as typeof answer).platforms.map((p) => p.id)

    // Порядок — ядра: свой мы не наводим, чтобы список не разъезжался с их
    // экраном при каждом обновлении.
    expect([...kept].sort()).toEqual([...CHANNEL_SHORTLIST].sort())
  })

  it('включённый канал не прячется, даже если он не в списке', () => {
    const withLive = {
      ...answer,
      platforms: [...answer.platforms, { id: 'dingtalk', enabled: true }]
    }

    const kept = (shortlistPlatforms(withLive) as typeof answer).platforms.map((p) => p.id)

    expect(kept, 'иначе пропал бы выключатель от работающего канала').toContain('dingtalk')
  })

  it('остальные поля ответа не трогаются', () => {
    expect((shortlistPlatforms(answer) as typeof answer).env_path).toBe('C:/profile/.env')
  })

  it('неожиданный ответ возвращается как есть, а не пустым списком', () => {
    expect(shortlistPlatforms({ platforms: 'не массив' })).toEqual({ platforms: 'не массив' })
    expect(shortlistPlatforms(null)).toBeNull()
  })
})
