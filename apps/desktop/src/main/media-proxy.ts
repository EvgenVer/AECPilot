// Звук и видео с машины ядра (задача 3.13b, SPEC UR20).
//
// ЗАЧЕМ ОТДЕЛЬНАЯ СХЕМА. Картинку можно прочитать целиком и отдать окну как
// `data:`; запись совещания на полтора часа — нельзя. Проигрыватель просит
// куски (`Range`), и ему нужен ИСТОЧНИК, а не файл в памяти.
//
// Прямой адрес ядра дать нельзя: он несёт токен, а SPEC C9 держит токен в
// главном процессе. Поэтому окно получает `hermes-media://remote/<путь>` — адрес
// без секрета, — а главный процесс подставляет и адрес ядра, и токен. Их код
// строит ровно такой адрес сам (`lib/media.ts`), и это тот случай, когда
// поддержать чужую договорённость дешевле, чем заводить свою.
//
// Границы: схема отвечает ТОЛЬКО когда ядро удалённое. Локально файл открывается
// как файл, и лишний обход по сети ради того же байта не нужен никому.

import { protocol, type Session } from 'electron'

import { SESSION_TOKEN_HEADER } from './hermes-rest-pure'
import type { RestTarget } from './hermes-rest'

export const MEDIA_SCHEME = 'hermes-media'

/** Путь к файлу из адреса `hermes-media://remote/<путь>`.
 *
 * Пустая строка — «не наш адрес»: разбор не должен бросать, потому что адрес
 * приходит из окна, а окно может ошибиться. */
export function mediaPathFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== `${MEDIA_SCHEME}:`) return ''

    // `hermes-media://remote/<путь>` — хост «remote» их же формы. Путь
    // закодирован целиком, поэтому берётся одним куском.
    const encoded = url.pathname.replace(/^\/+/, '')
    return encoded === '' ? '' : decodeURIComponent(encoded)
  } catch {
    return ''
  }
}

/** Регистрируется ДО готовности приложения — иначе `<video>` не примет схему
 * как источник потока. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
    }
  ])
}

/**
 * Включает схему в сессии окна.
 *
 * `target` спрашивается на каждый запрос, а не запоминается: подключение
 * меняется, и проигрыватель, ходящий к прошлому ядру, — это картинка «файл
 * пропал» на ровном месте.
 */
export function installMediaProtocol(
  windowSession: Session,
  target: () => RestTarget | undefined,
  fetchImpl: typeof fetch = fetch
): void {
  windowSession.protocol.handle(MEDIA_SCHEME, async (request) => {
    const path = mediaPathFromUrl(request.url)
    if (path === '') return new Response('bad media url', { status: 400 })

    const rest = target()
    if (!rest?.baseUrl) {
      // Локальный режим сюда попасть не должен: их код строит этот адрес только
      // для удалённого ядра. Если попал — честный отказ, а не молчащий плеер.
      return new Response('media proxy is for a remote core only', { status: 409 })
    }

    const upstream = new URL('/api/files/stream', rest.baseUrl)
    upstream.searchParams.set('path', path)

    const headers: Record<string, string> = { [SESSION_TOKEN_HEADER]: rest.token }
    // `Range` передаётся как есть: перемотка — это он и есть. Без него ядро
    // отдало бы файл с начала, и переход на середину записи не работал бы.
    const range = request.headers.get('range')
    if (range) headers.Range = range

    try {
      const answer = await fetchImpl(upstream.toString(), { headers })
      return new Response(answer.body, {
        status: answer.status,
        headers: passThroughHeaders(answer.headers)
      })
    } catch (error: unknown) {
      console.warn('aecpilot: media proxy FAIL', error)
      return new Response('media unavailable', { status: 502 })
    }
  })
}

/** Заголовки, без которых перемотка не работает. Остальные не переносятся: чем
 * меньше чужого попадает в окно, тем меньше поводов гадать, откуда оно. */
export function passThroughHeaders(from: Headers): Record<string, string> {
  const keep = ['content-type', 'content-length', 'content-range', 'accept-ranges']
  const headers: Record<string, string> = {}

  for (const name of keep) {
    const value = from.get(name)
    if (value !== null) headers[name] = value
  }

  return headers
}
