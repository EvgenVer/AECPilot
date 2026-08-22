// What turning an external channel on actually hands out, and how to notice
// that someone is about to do it (task 3.10, SPEC AC10 / risk R10).
//
// The screen that carries the switch is the donor's, and it enables a platform
// the moment the switch moves — no confirmation, because in their product the
// person flipping it is the person who set the whole thing up. Ours is an
// engineer whose vault holds someone else's project documents, so AC10 requires
// the list of what leaves the machine to be shown BEFORE the channel opens.
//
// The interception point is deliberately not their screen: a dialog wired into
// a vendored file would be a fifth kind of edit, and the next re-copy would
// silently drop it. It sits in our own bridge instead (`hermes-desktop-shim`),
// which every one of their backend calls passes through — so the guard survives
// a re-copy, and it also covers any OTHER surface of theirs that learns to
// enable a channel later.

/** The request their screen sends: `PUT /api/messaging/platforms/<id>` with
 * `{enabled: true}`. Disabling, renaming, or writing credentials goes through
 * the same route and must NOT be interrupted — only opening the door does. */
export function channelBeingEnabled(request: {
  path: string
  method?: string
  body?: unknown
}): null | string {
  if ((request.method ?? 'GET').toUpperCase() !== 'PUT') return null

  const match = /^\/api\/messaging\/platforms\/([^/?#]+)$/.exec(request.path)
  if (!match) return null

  const body = request.body
  if (typeof body !== 'object' || body === null) return null
  if ((body as { enabled?: unknown }).enabled !== true) return null

  return decodeURIComponent(match[1])
}

/** The three consequences R10 names, in the order they matter to the person
 * deciding. Keys, not sentences: the words live in our catalog, and the list
 * being data is what lets a test assert that none of them went missing. */
export const CHANNEL_DISCLOSURE_ITEMS = [
  'channels.disclosure.conversation',
  'channels.disclosure.files',
  'channels.disclosure.remoteStart'
] as const

export type ChannelDisclosureItem = (typeof CHANNEL_DISCLOSURE_ITEMS)[number]

/**
 * Что добавляется к перечню для отдельных платформ (задача 3.11).
 *
 * Три пункта выше верны для любого канала, но A2A отличается по СУЩЕСТВУ, а не
 * по степени: с той стороны не человек в переписке, а ДРУГАЯ ПРОГРАММА, и
 * приходит она не в чат, а на сетевой порт этой машины. Ядро к тому же
 * рассказывает о себе карточкой агента — что он умеет и как к нему обратиться.
 * Человек, включающий канал, должен понимать именно это; общими словами про
 * «сообщения» такого не скажешь.
 *
 * Замерено на ядре 0.20.4 (`plugins/platforms/a2a`): порт по умолчанию 9900,
 * без токена слушает только 127.0.0.1, задача попадает в ЖИВУЮ сессию — ту же,
 * в которой идёт разговор человека, со всей её памятью и файлами.
 */
export function extraDisclosureItems(platformId: string): readonly string[] {
  return platformId === 'a2a'
    ? (['channels.disclosure.a2aPort', 'channels.disclosure.a2aSession'] as const)
    : []
}

/**
 * Каналы, которые приложение показывает (задача 3.11, решение владельца
 * 2026-08-22).
 *
 * Ядро знает 33 платформы. Показывать все — значит обещать то, чего мы не
 * проверяли: у половины список нужен китайский аккаунт разработчика, и
 * подсказки к ним написаны не для нашего человека. Поэтому список НАШ, и за
 * каждый пункт в нём мы отвечаем.
 *
 * ВКЛЮЧЁННЫЙ канал не прячется никогда, даже если он не в списке. Спрятать
 * работающий канал значило бы отобрать у человека выключатель от того, что
 * прямо сейчас выносит его переписку наружу.
 */
export const CHANNEL_SHORTLIST = ['telegram', 'email', 'webhook', 'a2a'] as const

/** Их экран запрашивает список платформ этим GET. */
export function isPlatformListing(request: { path: string; method?: string }): boolean {
  return (
    (request.method ?? 'GET').toUpperCase() === 'GET' &&
    /^\/api\/messaging\/platforms(\?|$)/.test(request.path)
  )
}

/** Оставляет в ответе ядра только показываемые каналы. Ответ чужой формы
 * возвращается как есть: перехват не должен превращать неожиданный ответ в
 * пустой список. */
export function shortlistPlatforms(answer: unknown): unknown {
  if (typeof answer !== 'object' || answer === null) return answer

  const platforms = (answer as { platforms?: unknown }).platforms
  if (!Array.isArray(platforms)) return answer

  const allowed = new Set<string>(CHANNEL_SHORTLIST)

  return {
    ...answer,
    platforms: platforms.filter((platform) => {
      if (typeof platform !== 'object' || platform === null) return false
      const row = platform as { id?: unknown; enabled?: unknown }
      return allowed.has(String(row.id)) || row.enabled === true
    })
  }
}
