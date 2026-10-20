// Задача T42 (решения владельца 2026-10-16 и 2026-10-19). Уведомление о новой версии —
// только уведомление: приложение читает НАШ публичный файл последней версии и
// предлагает скачать установщик; ставит человек сам, `data/` при этом сохраняется
// (T30). Их обновлятор и их каналы не используются нигде (SPEC HX4).
//
// Файл версии — JSON `{ "version": "0.2.0", "url": "https://…/AECPilot-0.2.0-win-x64.exe" }`.
// Его адрес — настройка сборки (`aecpilot.updateFeedUrl` в package.json): пусто —
// проверки нет вовсе, ни одного запроса в сеть. Где публиковать файл, решается при
// первом выпуске (решение владельца 2026-10-19).

export interface UpdateNotice {
  version: string
  url: string
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

function parts(version: string): [number, number, number, string | null] | null {
  const match = VERSION.exec(version.trim().replace(/^v/, ''))
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] ?? null]
}

/** `latest` новее `current`? Предрелиз младше своего выпуска (`0.2.0-rc.1` < `0.2.0`);
 *  два предрелиза одной версии не сравниваются — «не новее»: предлагать скачать
 *  стоит то, в чём уверены. Непонятная строка — тоже «не новее». */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parts(latest)
  const b = parts(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number)
  }
  return a[3] === null && b[3] !== null
}

/** Разбор файла версии. Ссылка — только https: по ней человек скачает исполняемый
 *  файл, и открытый http подменяется в любой сети по дороге. */
export function parseUpdateFeed(text: string): UpdateNotice | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { version, url } = parsed as { version?: unknown; url?: unknown }
  if (typeof version !== 'string' || !parts(version)) return null
  if (typeof url !== 'string') return null
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return null
  }
  if (parsedUrl.protocol !== 'https:') return null
  return { version: version.trim().replace(/^v/, ''), url: parsedUrl.href }
}

/** Адрес файла версии из настройки сборки: пусто или не https — проверки нет. */
export function feedUrlFrom(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Что показать: новее текущей — уведомление, иначе ничего. */
export function decideUpdateNotice(feedText: string, current: string): UpdateNotice | null {
  const feed = parseUpdateFeed(feedText)
  if (!feed) return null
  return isNewerVersion(feed.version, current) ? feed : null
}
