// Pure logic behind the "Фоновые процессы" tab (tasks 1.6.B2a.4–B2a.6).
//
// Two sources, and they must not be merged into one list: `process.list` is
// scoped to OUR session and its entries can be stopped; `agents.list` is every
// session's processes and is observation only — their `process.kill` answers
// 4044 for a process owned by another session, and owner decision R8 rules out
// the unscoped `process.stop` entirely.

import type { AgentProcessEntry, ProcessEntry } from '../../../shared/gateway/types'

export interface ProcessRow {
  id: string
  command: string
  cwd?: string
  pid?: number
  uptimeSeconds?: number
  status: string
  exited: boolean
  /** Up to 4000 characters of output; `output_preview` (200) is the fallback. */
  tail?: string
  tailIsPreview: boolean
  /** True when this app can stop it — i.e. it belongs to our session. */
  killable: boolean
}

export function toOwnRows(entries: ProcessEntry[] | undefined): ProcessRow[] {
  return (entries ?? []).map((entry) => ({
    id: entry.session_id,
    command: entry.command ?? '',
    cwd: entry.cwd,
    pid: entry.pid,
    uptimeSeconds: entry.uptime_seconds,
    status: entry.status ?? 'unknown',
    exited: entry.status === 'exited',
    tail: entry.output_tail ?? entry.output_preview,
    tailIsPreview: !entry.output_tail && Boolean(entry.output_preview),
    killable: entry.status !== 'exited'
  }))
}

export function toOtherRows(entries: AgentProcessEntry[] | undefined): ProcessRow[] {
  return (entries ?? []).map((entry) => ({
    id: entry.session_id,
    command: entry.command ?? '',
    uptimeSeconds: entry.uptime,
    status: entry.status ?? 'unknown',
    exited: entry.status === 'exited',
    tailIsPreview: false,
    killable: false
  }))
}

/** Drops from `others` anything already listed as ours.
 *
 * `agents.list` is unscoped, so it repeats our own processes. Showing a
 * process twice — once stoppable, once not — would read as two processes. */
export function mergeProcessRows(
  own: ProcessRow[],
  others: ProcessRow[]
): {
  own: ProcessRow[]
  others: ProcessRow[]
} {
  const ownIds = new Set(own.map((row) => row.id))
  return { own, others: others.filter((row) => !ownIds.has(row.id)) }
}

/** Uptime as "7 с" / "3 мин" / "2 ч 05 мин". Seconds below a minute stay
 * seconds: a freshly started process showing "0 мин" reads as stuck. */
export function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return ''
  const total = Math.floor(seconds)
  if (total < 60) return `${total} с`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  return `${hours} ч ${String(minutes % 60).padStart(2, '0')} мин`
}

/** What the gateway's `process.kill` answer means, in words.
 *
 * The three statuses are all successful RPC results and mean different things:
 * the process was stopped, it had already finished on its own, or the registry
 * has no such id. `4044` arrives as an RPC error and means the process belongs
 * to another session — which is a rule, not a failure. */
export function describeKillOutcome(status: string | undefined, error?: string): string {
  if (status === 'killed') return 'Процесс остановлен.'
  if (status === 'already_exited') return 'Процесс уже завершился сам.'
  if (status === 'not_found') return 'Такого процесса больше нет в реестре ядра.'
  if (status === 'error') return `Остановить не удалось: ${error ?? 'причина не названа'}`
  return `Ядро ответило непонятным статусом: ${status ?? 'пусто'}`
}

export function describeKillError(message: string): string {
  if (/4044|no such process/i.test(message)) {
    return 'Этот процесс принадлежит другой сессии — останавливать чужие процессы приложение не даёт.'
  }
  return message
}

export const OTHERS_NOTICE =
  'Процессы других сессий шлюза — только наблюдение: остановить их отсюда нельзя.'

export const EMPTY_HINT =
  'Фоновых процессов нет. Здесь появляется то, что агент запустил в фоне — серверы, сборки, длинные команды.'
