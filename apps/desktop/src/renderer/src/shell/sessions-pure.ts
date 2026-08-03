// Pure logic behind the "Сессии" section of the Агент hub (tasks 1.6.B5.3–B5.10).
// Contract: specs/agent-sessions.md.
//
// Two lists, two different questions, and merging them would answer neither:
// `session.list` reads the DATABASE (every conversation this project ever had,
// scoped to the open vault by main's own tagging — the gateway cannot do it,
// its rows carry no `cwd`), while `session.active_list` reports the sessions
// this gateway PROCESS is currently holding open. A session can be in both, and
// the difference decides what is offered: only a live one can be attached to
// with `session.activate`, and a live one cannot be deleted at all (4023).

import type { LiveSessionSummary } from '../../../shared/gateway/types'

/** What to call a session on screen. The gateway leaves `title` empty until
 * its auto-titler runs, so the preview is the honest fallback; the id is the
 * last resort and is at least stable. */
export function sessionLabel(session: { title?: string; preview?: string; id: string }): string {
  const title = (session.title ?? '').trim()
  if (title !== '') return title
  const preview = (session.preview ?? '').trim()
  if (preview !== '') return preview
  return session.id
}

/** Client-side search (task 1.6.B5.5).
 *
 * The gateway has no search at all — `session.list` takes `limit` and nothing
 * else — so this filters what already arrived, over the only two text fields
 * a row carries. Message bodies are NOT searched, and the UI says so rather
 * than letting an empty result read as "no such conversation".
 */
export function filterSessions<T extends { title?: string; preview?: string; id: string }>(
  sessions: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...sessions]
  return sessions.filter((session) => {
    const title = (session.title ?? '').toLowerCase()
    const preview = (session.preview ?? '').toLowerCase()
    return title.includes(needle) || preview.includes(needle)
  })
}

/** Russian plural for a count of messages: 1 сообщение, 2 сообщения, 5
 * сообщений. Abbreviating to "сообщ." would dodge the problem, but this string
 * sits under every row and reads as machine output. */
export function formatMessageCount(count: number | undefined): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count as number)) : 0
  const tail = n % 100
  const last = n % 10
  if (tail >= 11 && tail <= 14) return `${n} сообщений`
  if (last === 1) return `${n} сообщение`
  if (last >= 2 && last <= 4) return `${n} сообщения`
  return `${n} сообщений`
}

/** When the session started, in LOCAL time — the gateway sends epoch seconds
 * (`time.time()`), and a session opened at 01:00 must not read as yesterday.
 * A missing/garbage timestamp yields an empty string rather than 1970. */
export function formatStartedAt(startedAt: number | undefined): string {
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) return ''
  const date = new Date(startedAt * 1000)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

/** Which stored sessions the gateway is holding open right now.
 *
 * Used for two different refusals, so it returns the map rather than a boolean:
 * a live session cannot be deleted (their handler answers 4023), and a live
 * session is the only one `session.activate` can attach to. */
export function liveKeys(live: readonly LiveSessionSummary[] | undefined): Set<string> {
  return new Set((live ?? []).map((row) => row.session_key).filter((key) => key !== ''))
}

/** Applies a `session.title` event to the stored list (task 1.6.B5.8).
 *
 * The id to match is the one in the PAYLOAD (the stored key their
 * `title_callback` passes), not the one on the event envelope (the live sid) —
 * matching the envelope would rename nothing, or worse, the wrong row. An
 * event for a session this list does not hold changes nothing, and identity is
 * preserved so React does not re-render for it. */
export function applySessionTitle<T extends { id: string; title: string }>(
  sessions: readonly T[],
  payload: { session_id?: string; title?: string } | undefined
): T[] {
  const id = payload?.session_id
  const title = payload?.title
  if (typeof id !== 'string' || id === '' || typeof title !== 'string' || title.trim() === '') {
    return sessions as T[]
  }
  if (!sessions.some((session) => session.id === id)) return sessions as T[]
  return sessions.map((session) => (session.id === id ? { ...session, title } : session))
}

/** The confirmation text for deleting a session.
 *
 * Says the two things their handler actually does — drops the database row and
 * removes the transcript files — because "удалить сессию?" would let a user
 * assume it can be undone. Nothing in the gateway can. */
export function describeSessionDeletion(label: string): string {
  return (
    `Удалить сессию «${label}»? Ядро сотрёт и запись в базе, и файлы транскрипта — ` +
    'вернуть переписку будет нечем.'
  )
}

/** Explains a `session.delete` refusal in the section's own terms. Their 4023
 * is a rule, not a fault: a session open in the gateway is still being written
 * to. */
export function describeDeleteError(message: string): string {
  if (/4023|cannot delete an active session/i.test(message)) {
    return 'Эта сессия сейчас открыта в ядре — сначала переключитесь на другую, потом удаляйте.'
  }
  return message
}

/** Their live-session `status` in words. Unknown values are shown as-is rather
 * than swallowed: a status this app has never seen is information. */
export function describeLiveStatus(status: string | undefined): string {
  if (status === 'streaming') return 'отвечает'
  if (status === 'idle') return 'ждёт'
  if (status === 'busy') return 'занята'
  return (status ?? '').trim()
}

export const SESSIONS_EMPTY_HINT =
  'В этом проекте ещё нет сессий. Сессия появляется, когда вы отправляете агенту первое сообщение.'

/** Shown INSTEAD of "ничего не найдено": the difference between "такой
 * переписки нет" and "мы ищем не там" is the whole point (§Поиск of the spec). */
export const SEARCH_EMPTY_HINT =
  'Ничего не нашлось. Поиск идёт по имени сессии и по превью первого сообщения — ' +
  'искать по тексту переписки ядро не умеет.'

export const LIVE_SESSIONS_HINT =
  'Сессии, открытые в ядре прямо сейчас. Переключение между ними не закрывает предыдущую.'
