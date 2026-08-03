import { useCallback, useEffect, useState } from 'react'
import type { HistoryMessage } from '../../../shared/gateway/types'
import type { ProfileRow } from '../../../shared/ipc'

/** "Профили" in the Агент hub (task 1.6.B5.23). Contract:
 * specs/agent-sessions.md §Профили.
 *
 * A profile is where the agent's data physically lives — its config, its keys,
 * its skills and its sessions. This is the batch's only REST surface, and not
 * by preference: the gateway has no `profile.*` methods at all (owner decision
 * B5-1=C, rule R1).
 *
 * The one thing this screen must not imply: switching does NOT move the
 * running core. Their `POST /api/profiles/active` only changes what a future
 * CLI run picks up — this app instead passes `profile` on
 * `session.create`/`session.resume`, which is what actually re-targets a chat
 * (measured, `runtime/profiles-probe.mjs`). */
export default function ProfilesPanel({
  onSessionLoaded
}: {
  /** Switching profiles abandons the active session on the main side, so the
   * transcript is cleared to match — the same reset a project switch does. */
  onSessionLoaded: (messages: HistoryMessage[]) => void
}) {
  const [profiles, setProfiles] = useState<ProfileRow[] | undefined>(undefined)
  const [current, setCurrent] = useState('default')
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    const result = await window.aecpilot.listProfiles()
    setProfiles(result.profiles)
    setCurrent(result.current)
  }, [])

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

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function create(): Promise<void> {
    const name = draftName.trim()
    if (name === '') return
    await run(async () => {
      await window.aecpilot.createProfile(name)
      setDraftName('')
      setNotice(`Профиль «${name}» создан. Переключитесь на него, чтобы вести в нём сессии.`)
      await load()
    })
  }

  async function use(name: string): Promise<void> {
    await run(async () => {
      const result = await window.aecpilot.useProfile(name)
      setCurrent(result.current)
      // The session that was open belonged to the previous profile; keeping it
      // on screen would show a conversation the new profile does not have.
      onSessionLoaded([])
      setNotice(
        `Новые сессии пойдут в профиль «${name}». Уже запущенное ядро на другой профиль ` +
          'не переезжает — переключение действует на сессии, а не на процесс.'
      )
      await load()
    })
  }

  async function remove(name: string): Promise<void> {
    await run(async () => {
      await window.aecpilot.deleteProfile({ name, confirmed: true })
      setConfirmDelete(undefined)
      setNotice(`Профиль «${name}» удалён.`)
      await load()
    })
  }

  return (
    <div className="profiles-panel">
      {error && <div className="settings-popover__error">{error}</div>}
      {notice && <div className="settings-section__hint">{notice}</div>}

      <div className="settings-section__confirm-actions">
        <input
          type="text"
          value={draftName}
          placeholder="имя нового профиля"
          aria-label="Имя нового профиля"
          onChange={(event) => setDraftName(event.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || draftName.trim() === ''}
        >
          Создать
        </button>
      </div>

      {profiles !== undefined && profiles.length === 0 && (
        <div className="settings-section__empty">
          Профилей нет — всё живёт в домашнем каталоге hermes.
        </div>
      )}

      <ul className="session-list">
        {(profiles ?? []).map((profile) => (
          <li key={profile.name} className="session-row">
            <div className="session-row__head">
              <button
                type="button"
                className="session-row__name"
                onClick={() => void use(profile.name)}
                disabled={busy || profile.name === current}
              >
                {profile.name}
              </button>
              {profile.name === current && <span className="skill-row__state">текущий</span>}
              <button
                type="button"
                className="settings-popover__link-btn"
                onClick={() => setConfirmDelete(profile.name)}
                disabled={busy || profile.name === current || profile.isDefault}
                title={
                  profile.name === current
                    ? 'Нельзя удалить профиль, в котором сейчас работаете'
                    : profile.isDefault
                      ? 'Профиль «default» — это сам домашний каталог hermes'
                      : 'Удалить профиль со всем его содержимым'
                }
              >
                Удалить
              </button>
            </div>
            <div className="session-row__meta">
              {profile.model ? `${profile.model} · ` : ''}
              {profile.skillCount !== undefined ? `скилов ${profile.skillCount} · ` : ''}
              {profile.path}
            </div>
            {profile.description && <div className="skill-row__desc">{profile.description}</div>}
          </li>
        ))}
      </ul>

      {confirmDelete && (
        <div className="settings-section__confirm" role="alertdialog" aria-label="Удалить профиль">
          <div>
            Удалить профиль «{confirmDelete}»? Вместе с ним исчезнут его настройки, ключи, скилы и
            вся история его сессий — восстановить их будет нечем.
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
