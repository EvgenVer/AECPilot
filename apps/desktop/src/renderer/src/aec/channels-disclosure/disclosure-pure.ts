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
 * Что добавляется к перечню для отдельных платформ (задачи 3.11, 3E.9а).
 *
 * Три пункта выше верны для любого канала. Здесь живут те, что отличаются по
 * СУЩЕСТВУ, а не по степени, — и каждый пункт стоит на замере ядра, а не на
 * общих словах про «сообщения».
 *
 * A2A (ядро 0.20.4, `plugins/platforms/a2a`): с той стороны не человек в
 * переписке, а ДРУГАЯ ПРОГРАММА, и приходит она не в чат, а на сетевой порт
 * этой машины; порт по умолчанию 9900, без токена слушает только 127.0.0.1,
 * задача попадает в ЖИВУЮ сессию — ту же, в которой идёт разговор человека.
 *
 * Teams (ядро 0.21.0, `plugins/platforms/teams`): канал держится приложением
 * Azure AD — тем самым, чей секрет человек вводит, — и принимает сообщения
 * входящим слушателем Bot Framework. Умолчание порта 3978, а host по умолчанию
 * НЕ ЗАДАН, то есть слушаются все интерфейсы, а не только 127.0.0.1.
 *
 * Microsoft Graph (ядро 0.21.0, `gateway/platforms/msgraph_webhook`): в машину
 * звонит сам Microsoft — уведомлениями об изменениях подписанных ресурсов.
 * Порт 8646 по пути `/msgraph/webhook`, host по умолчанию снова не задан (в их
 * комментарии так и сказано: умолчание на все интерфейсы), а проверяется лишь
 * `client_state`, если его задали, и список CIDR, если его задали. Доступ
 * приложения к Graph — не «ваша почта»: это права приложения Azure AD на
 * данные ТЕНАНТА в пределах выданных ему разрешений.
 *
 * Signal (ядро 0.21.5, `gateway/platforms/signal.py`, задача 3G.28): ядро не
 * говорит с Signal само — нужен демон `signal-cli` в режиме HTTP на этой машине
 * (`127.0.0.1:8080`), привязанный к номеру человека; его ставит и держит человек.
 * Писать агенту в личку может ЛЮБОЙ: `SIGNAL_ALLOWED_USERS` по умолчанию `*`
 * (группы выключены, пока их список не задан).
 *
 * WhatsApp, личный аккаунт (ядро 0.21.5, `plugins/platforms/whatsapp`): мост
 * Node на Baileys — клиент WhatsApp Web — на `127.0.0.1:3000`; в профиле
 * хранится ВОШЕДШАЯ сессия WhatsApp Web этого номера, при первом запуске мост
 * ставит свои пакеты `npm install`. Сторонний мост WhatsApp официально не
 * поддерживает: их же документация называет риск ограничения номера и советует
 * отдельный номер. `whatsapp_cloud` (Business Cloud API) карточки не получает.
 */
const EXTRA_DISCLOSURE: Record<string, readonly string[]> = {
  a2a: ['channels.disclosure.a2aPort', 'channels.disclosure.a2aSession'],
  teams: ['channels.disclosure.teamsApp', 'channels.disclosure.teamsPort'],
  msgraph_webhook: ['channels.disclosure.graphPort', 'channels.disclosure.graphTenant'],
  signal: ['channels.disclosure.signalCli', 'channels.disclosure.signalAnyone'],
  whatsapp: ['channels.disclosure.whatsappSession', 'channels.disclosure.whatsappBan']
}

export function extraDisclosureItems(platformId: string): readonly string[] {
  return EXTRA_DISCLOSURE[platformId] ?? []
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
 *
 * ПОПОЛНЕН 2026-09-09 задачей 3E.9а: `teams` и `msgraph_webhook`. Решение O7
 * (2026-08-22) утвердило четыре канала, UR34 (2026-09-05) взял Microsoft Graph
 * в объём — и без карточки канал не включить вовсе, то есть требование
 * оставалось бы недостижимым из окна. За оба пункта мы отвечаем: у каждого свой
 * перечень того, что уходит и что приходит, ниже.
 *
 * ПОПОЛНЕН 2026-09-28 задачей 3G.28 (решение владельца, UR19): `signal` и
 * `whatsapp` (личный аккаунт через мост). Перечни — выше, по коду адаптеров.
 */
export const CHANNEL_SHORTLIST = [
  'telegram',
  'email',
  'webhook',
  'a2a',
  'teams',
  'msgraph_webhook',
  'signal',
  'whatsapp'
] as const

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

/** Имена каналов с их карточек из того же ответа ядра (D-107): вопрос о
 * включении называет канал так, как его видит человек, а не id из конфига. */
export function platformNames(answer: unknown): Map<string, string> {
  const names = new Map<string, string>()
  const platforms = (answer as { platforms?: unknown } | null)?.platforms
  if (!Array.isArray(platforms)) return names

  for (const platform of platforms) {
    const row = platform as { id?: unknown; name?: unknown } | null
    if (typeof row?.id === 'string' && typeof row.name === 'string' && row.name.trim()) {
      names.set(row.id, row.name.trim())
    }
  }
  return names
}
