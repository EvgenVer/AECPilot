import { useCallback, useEffect, useState } from 'react'
import type {
  HistoryMessage,
  LiveSessionSummary,
  SessionSummary
} from '../../../shared/gateway/types'
import {
  applySessionTitle,
  describeDeleteError,
  describeLiveStatus,
  describeSessionDeletion,
  filterSessions,
  formatMessageCount,
  formatStartedAt,
  liveKeys,
  sessionLabel,
  LIVE_SESSIONS_HINT,
  SEARCH_EMPTY_HINT,
  SESSIONS_EMPTY_HINT
} from './sessions-pure'

/** "Сессии" in the Агент hub (tasks 1.6.B5.3–B5.10). Contract:
 * specs/agent-sessions.md.
 *
 * The list is already scoped to the open project when it arrives: main's
 * `sessions:list` filters `session.list` through `sessionIdsForProject`
 * (task 1.20), because the gateway cannot do it — MEASURED, its rows carry no
 * `cwd`. This component therefore does no project filtering of its own; a
 * second copy of that rule is exactly what would drift.
 *
 * Live sessions are a separate group and a separate question (`session.
 * active_list`): attaching to one does not close the previous one, which is
 * what makes them parallel. */
export default function SessionsPanel({
  streaming,
  onSessionLoaded
}: {
  /** A turn is in flight — switching sessions mid-answer would leave the
   * stream writing into a transcript nobody is looking at. */
  streaming: boolean
  onSessionLoaded: (messages: HistoryMessage[]) => void
}) {
  const [sessions, setSessions] = useState<SessionSummary[] | undefined>(undefined)
  const [live, setLive] = useState<LiveSessionSummary[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>(undefined)
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    const [stored, active] = await Promise.all([
      window.aecpilot.listSessions(),
      // The live list is a bonus, not the point: a gateway that answers the
      // stored list but not this one should still show the sessions.
      window.aecpilot.listActiveSessions().catch(() => ({ sessions: [] }))
    ])
    setSessions(stored.sessions)
    setLive(active.sessions ?? [])
  }, [])

  // The first read is deferred by a microtask on purpose: a synchronous
  // setState inside an effect body cascades renders (`react-hooks/
  // set-state-in-effect`), and the same shape is already used by the composer's
  // queue and the goal badge (tasks 1.6.8/A5).
  useEffect(() => {
    let mounted = true
    void Promise.resolve().then(() =>
      load().catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    )
    return () => {
      mounted = false
    }
  }, [load])

  // Task 1.6.B5.8: their auto-titler renames a session after the turn, long
  // after this list was fetched. The payload's id is the STORED key while the
  // envelope's is the live sid — see `applySessionTitle`.
  useEffect(() => {
    return window.aecpilot.onChatEvent((event) => {
      if (event.type !== 'session.title') return
      const payload = event.payload as { session_id?: string; title?: string } | undefined
      setSessions((prev) => (prev === undefined ? prev : applySessionTitle(prev, payload)))
    })
  }, [])

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (err) {
      setError(describeDeleteError(err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  async function switchTo(storedId: string): Promise<void> {
    await run(async () => {
      const { messages } = await window.aecpilot.switchSession(storedId)
      onSessionLoaded(messages)
      setNotice(undefined)
      await load()
    })
  }

  async function activate(liveId: string): Promise<void> {
    await run(async () => {
      const { messages } = await window.aecpilot.activateSession(liveId)
      onSessionLoaded(messages)
      await load()
    })
  }

  async function remove(storedId: string): Promise<void> {
    await run(async () => {
      await window.aecpilot.deleteSession({ storedId, confirmed: true })
      setConfirmDelete(undefined)
      await load()
    })
  }

  async function rename(storedId: string, title: string): Promise<void> {
    await run(async () => {
      const result = await window.aecpilot.renameSession({ storedId, title })
      setRenaming(undefined)
      setNotice(
        result.pending
          ? `Имя «${result.title}» применится после первого сообщения этой сессии.`
          : `Сессия переименована в «${result.title}».`
      )
      await load()
    })
  }

  async function branch(): Promise<void> {
    await run(async () => {
      const result = await window.aecpilot.branchSession()
      setNotice(`Создана ветка «${result.title}». Прежняя сессия осталась открытой.`)
      await load()
    })
  }

  const liveByKey = liveKeys(live)
  const current = live.find((row) => row.current)
  // Their `session.branch` refuses an empty session with 4008 ("nothing to
  // branch — send a message first", MEASURED). Disabling the control is the
  // honest form of that rule: an enabled button that always fails is worse.
  const canBranch = current !== undefined && current.message_count > 0 && !streaming
  const visible = filterSessions(sessions ?? [], query)

  return (
    <div className="sessions-panel">
      {error && <div className="settings-popover__error">{error}</div>}
      {notice && <div className="settings-section__hint">{notice}</div>}

      <div className="settings-section__head">
        <input
          type="search"
          value={query}
          placeholder="поиск по сессиям"
          aria-label="Поиск по сессиям"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="button"
          className="settings-popover__link-btn"
          onClick={() => void branch()}
          disabled={busy || !canBranch}
          title={
            canBranch
              ? 'Продолжить разговор в отдельной ветке'
              : 'Ветвить можно сессию, в которой уже есть хотя бы один ход'
          }
        >
          Ветвить
        </button>
      </div>

      {live.length > 0 && (
        <>
          <div className="settings-popover__section-title">Открыты сейчас</div>
          <div className="settings-section__hint">{LIVE_SESSIONS_HINT}</div>
          <ul className="session-list">
            {live.map((row) => (
              <li key={row.id} className="session-row">
                <button
                  type="button"
                  className="session-row__name"
                  onClick={() => void activate(row.id)}
                  disabled={busy || row.current || streaming}
                >
                  {sessionLabel(row)}
                </button>
                <span className="session-row__meta">
                  {row.current ? 'текущая' : describeLiveStatus(row.status)}
                  {row.model ? ` · ${row.model}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="settings-popover__section-title">Все сессии проекта</div>

      {sessions !== undefined && sessions.length === 0 && (
        <div className="settings-section__empty">{SESSIONS_EMPTY_HINT}</div>
      )}
      {sessions !== undefined && sessions.length > 0 && visible.length === 0 && (
        <div className="settings-section__empty">{SEARCH_EMPTY_HINT}</div>
      )}

      <ul className="session-list">
        {visible.map((session) => {
          const label = sessionLabel(session)
          const isLive = liveByKey.has(session.id)
          return (
            <li key={session.id} className="session-row">
              {renaming?.id === session.id ? (
                <div className="settings-section__confirm-actions">
                  <input
                    type="text"
                    value={renaming.draft}
                    aria-label={`Новое имя сессии ${label}`}
                    onChange={(event) => setRenaming({ id: session.id, draft: event.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => void rename(session.id, renaming.draft)}
                    disabled={busy || renaming.draft.trim() === ''}
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    className="settings-popover__link-btn"
                    onClick={() => setRenaming(undefined)}
                    disabled={busy}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <>
                  <div className="session-row__head">
                    <button
                      type="button"
                      className="session-row__name"
                      onClick={() => void switchTo(session.id)}
                      disabled={busy || streaming}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      className="settings-popover__link-btn"
                      onClick={() => setRenaming({ id: session.id, draft: label })}
                      disabled={busy}
                    >
                      Переименовать
                    </button>
                    <button
                      type="button"
                      className="settings-popover__link-btn"
                      onClick={() => setConfirmDelete(session.id)}
                      disabled={busy || isLive}
                      title={
                        isLive
                          ? 'Сессия открыта в ядре — удалить её нельзя'
                          : 'Удалить сессию безвозвратно'
                      }
                    >
                      Удалить
                    </button>
                  </div>
                  <div className="session-row__meta">
                    {formatMessageCount(session.message_count)}
                    {formatStartedAt(session.started_at)
                      ? ` · ${formatStartedAt(session.started_at)}`
                      : ''}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {confirmDelete && (
        <div className="settings-section__confirm" role="alertdialog" aria-label="Удалить сессию">
          <div>
            {describeSessionDeletion(
              sessionLabel(
                (sessions ?? []).find((s) => s.id === confirmDelete) ?? {
                  id: confirmDelete,
                  title: '',
                  preview: ''
                }
              )
            )}
          </div>
          <div className="settings-section__confirm-actions">
            <button type="button" onClick={() => void remove(confirmDelete)} disabled={busy}>
              Удалить
            </button>
            <button
              type="button"
              className="settings-popover__link-btn"
              onClick={() => setConfirmDelete(undefined)}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
