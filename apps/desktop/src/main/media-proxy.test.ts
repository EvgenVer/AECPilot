// Задача 3.13b (SPEC UR20). Проверяется то, ради чего эта схема заведена:
// перемотка работает (`Range` доходит до ядра и ответ о куске возвращается
// целым), а токен при этом в окно не попадает.

import { describe, expect, it, vi } from 'vitest'

import { mediaPathFromUrl, passThroughHeaders } from './media-proxy'

describe('адрес без секрета', () => {
  it('путь достаётся целиком, включая пробелы и кириллицу', () => {
    const url = `hermes-media://remote/${encodeURIComponent('/srv/записи/совещание 12.mp4')}`

    expect(mediaPathFromUrl(url)).toBe('/srv/записи/совещание 12.mp4')
  })

  it('путь с чужим разделителем не ломается', () => {
    const url = `hermes-media://remote/${encodeURIComponent('C:\\media\\клип.mp4')}`

    expect(mediaPathFromUrl(url)).toBe('C:\\media\\клип.mp4')
  })

  it('профиль в запросе пути не портит', () => {
    const url = `hermes-media://remote/${encodeURIComponent('/srv/a.mp3')}?profile=второй`

    expect(mediaPathFromUrl(url)).toBe('/srv/a.mp3')
  })

  it('чужая схема и мусор — пусто, а не исключение', () => {
    expect(mediaPathFromUrl('https://example.org/a.mp4')).toBe('')
    expect(mediaPathFromUrl('hermes-media://remote/')).toBe('')
    expect(mediaPathFromUrl('не адрес')).toBe('')
  })
})

describe('заголовки ответа', () => {
  it('переносится ровно то, без чего нет перемотки', () => {
    const headers = new Headers({
      'content-type': 'video/mp4',
      'content-range': 'bytes 0-1023/8192',
      'accept-ranges': 'bytes',
      // Заголовки — байтовая строка, кириллицу в них не положить; секрет
      // изображён латиницей, суть та же: чужого в окно уезжать не должно.
      'set-cookie': 'session=secret-value',
      'x-hermes-session-token': 'secret-value'
    })

    const kept = passThroughHeaders(headers)

    expect(kept['content-range']).toBe('bytes 0-1023/8192')
    expect(kept['accept-ranges']).toBe('bytes')
    expect(Object.keys(kept)).not.toContain('set-cookie')
    expect(JSON.stringify(kept), 'ничего чужого в окно не уезжает').not.toContain('secret-value')
  })
})

// Сам обработчик проверяется отдельно: `installMediaProtocol` требует сессии
// Electron, поэтому берётся её узкая подделка — предмет проверки не Electron, а
// то, что и куда мы отправляем.
describe('обращение к ядру', () => {
  async function handlerFor(target: unknown): Promise<(request: Request) => Promise<Response>> {
    const { installMediaProtocol } = await import('./media-proxy')
    let handler: ((request: Request) => Promise<Response>) | undefined

    const fakeSession = {
      protocol: {
        handle: (_scheme: string, fn: (request: Request) => Promise<Response>) => {
          handler = fn
        }
      }
    }

    installMediaProtocol(
      fakeSession as unknown as Parameters<typeof installMediaProtocol>[0],
      () => target as never,
      fetchSpy
    )

    return handler as (request: Request) => Promise<Response>
  }

  const fetchSpy = vi.fn(
    async () =>
      new Response('байты', {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-4/9' }
      })
  )

  it('перемотка доходит до ядра, а токен уходит заголовком', async () => {
    fetchSpy.mockClear()
    const handle = await handlerFor({ baseUrl: 'https://core.example.org', token: 'core-token' })

    const answer = await handle(
      new Request(`hermes-media://remote/${encodeURIComponent('/srv/a.mp4')}`, {
        headers: { Range: 'bytes=0-4' }
      })
    )

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/files/stream')
    expect(url).toContain(encodeURIComponent('/srv/a.mp4'))
    expect((init.headers as Record<string, string>).Range).toBe('bytes=0-4')
    expect((init.headers as Record<string, string>)['X-Hermes-Session-Token']).toBe('core-token')

    expect(answer.status, 'кусок остаётся куском — иначе перемотка не работает').toBe(206)
    expect(answer.headers.get('content-range')).toBe('bytes 0-4/9')
  })

  it('локальное ядро — отказ, а не молчащий проигрыватель', async () => {
    const handle = await handlerFor(undefined)

    const answer = await handle(new Request('hermes-media://remote/x'))

    expect(answer.ok).toBe(false)
  })

  it('ядро не ответило — тоже отказ, а не падение главного процесса', async () => {
    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('сеть недоступна')
    })
    const handle = await handlerFor({ baseUrl: 'https://core.example.org', token: 't' })

    const answer = await handle(
      new Request(`hermes-media://remote/${encodeURIComponent('/srv/a.mp4')}`)
    )

    expect(answer.status).toBe(502)
  })
})
