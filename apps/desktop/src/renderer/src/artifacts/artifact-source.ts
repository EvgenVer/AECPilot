// Where the artifacts tab gets its material (task 1.6.B7.3). Contract:
// specs/external-surfaces.md.
//
// The scan is: every session of the OPEN PROJECT → its stored transcript → the
// heuristic in `artifact-extract.ts`. Two things about that chain are worth
// stating here rather than leaving to be rediscovered:
//
// - **The project filter is not applied here.** `sessions:list` already returns
//   only sessions tagged against the open vault (main's `session-projects.ts`,
//   task 1.20) — the gateway cannot do it, its rows carry no `cwd`. A second
//   copy of that rule in this file is exactly what would drift.
// - **The transcript comes over REST**, not from `session.history`. Task
//   1.6.B7.3 named the RPC; it cannot serve this, measured twice over — see
//   the `sessions:messages` handler in main for the two reasons and their
//   line numbers.
//
// A session whose transcript fails to load does NOT fail the scan: it is
// reported separately, because "we read 9 of 10 sessions" and "we read
// nothing" are different answers and only the second one may replace the list.

import type { StoredMessageRow } from '../../../shared/ipc'
import { collectArtifacts, type ArtifactMessage, type ArtifactRecord } from './artifact-extract'

export interface SkippedSession {
  id: string
  title: string
  error: string
}

export interface ArtifactScan {
  /** Newest first. */
  artifacts: ArtifactRecord[]
  /** Sessions whose transcript could not be read — the list is still shown. */
  skipped: SkippedSession[]
  /** Set only when NOTHING could be read: no session list, or every session
   * failed. The tab shows this instead of an empty list — "нашли ноль" and
   * "не смогли посмотреть" must not look the same. */
  error?: string
  /** How many sessions were actually read, for the "N сессий" line. */
  scanned: number
}

/** The transcript API this scan needs, narrowed to two calls so a test can
 * supply them without a preload bridge. */
export interface ArtifactApi {
  listSessions: () => Promise<{
    sessions: { id: string; title?: string; preview?: string; started_at?: number }[]
  }>
  getSessionMessages: (storedId: string) => Promise<{ messages: StoredMessageRow[] }>
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return text.trim() || 'неизвестная ошибка'
}

/** Flattens their `content` column into text.
 *
 * `_decode_content` (hermes_state.py:4139) gives back a plain string for an
 * ordinary message and a decoded structure for a multimodal one. The structure
 * is walked for its `text` parts rather than stringified: `JSON.stringify`
 * would double every backslash, and a Windows path with doubled backslashes is
 * a path that does not exist. */
export function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(contentToText).filter(Boolean).join('\n')
  }
  if (content && typeof content === 'object') {
    const text = (content as { text?: unknown }).text
    return typeof text === 'string' ? text : ''
  }
  return ''
}

/** Raw DB rows → the shape the heuristic reads. */
export function toArtifactMessages(rows: readonly StoredMessageRow[]): ArtifactMessage[] {
  return rows.map((row) => ({
    role: typeof row.role === 'string' ? row.role : '',
    text: contentToText(row.content),
    ...(row.tool_calls === undefined ? {} : { toolCalls: row.tool_calls }),
    ...(typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
      ? { timestamp: Math.round(row.timestamp) }
      : {})
  }))
}

/** Newest first; ties broken by label so the order is stable between scans
 * (a session's messages can share one timestamp to the second). */
function byRecency(a: ArtifactRecord, b: ArtifactRecord): number {
  return b.timestamp - a.timestamp || a.label.localeCompare(b.label)
}

export const ARTIFACTS_EMPTY_HINT =
  'Артефактов пока нет. Здесь появятся файлы, картинки и ссылки, которые агент создаст или назовёт в ходе работы над проектом.'

export const ARTIFACTS_NO_SESSIONS_HINT =
  'В этом проекте ещё не было ни одной сессии с агентом — значит и артефактам взяться неоткуда.'

/** Scans the open project's sessions for artifacts.
 *
 * Sessions are read one after another rather than all at once: the core opens
 * its SQLite file per request, and a burst of parallel reads buys nothing on a
 * local database while making a partial failure harder to attribute. */
export async function scanArtifacts(api: ArtifactApi): Promise<ArtifactScan> {
  let sessions: Awaited<ReturnType<ArtifactApi['listSessions']>>['sessions']
  try {
    sessions = (await api.listSessions()).sessions ?? []
  } catch (error) {
    return {
      artifacts: [],
      skipped: [],
      scanned: 0,
      error: `Не удалось получить список сессий: ${errorText(error)}`
    }
  }

  const artifacts: ArtifactRecord[] = []
  const skipped: SkippedSession[] = []
  let scanned = 0

  for (const session of sessions) {
    try {
      const { messages } = await api.getSessionMessages(session.id)
      scanned += 1
      artifacts.push(
        ...collectArtifacts(
          {
            id: session.id,
            title: session.title,
            preview: session.preview,
            startedAt: session.started_at
          },
          toArtifactMessages(messages ?? [])
        )
      )
    } catch (error) {
      skipped.push({
        id: session.id,
        title: session.title?.trim() || session.id,
        error: errorText(error)
      })
    }
  }

  // Every session failed — that is not "нашли ноль", and the tab must not draw
  // an empty list over it.
  if (sessions.length > 0 && scanned === 0) {
    return {
      artifacts: [],
      skipped,
      scanned: 0,
      error: `Не удалось прочитать историю сессий: ${skipped[0]?.error ?? 'неизвестная ошибка'}`
    }
  }

  return { artifacts: artifacts.sort(byRecency), skipped, scanned }
}
