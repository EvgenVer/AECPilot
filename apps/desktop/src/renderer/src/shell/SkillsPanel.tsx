import { useEffect, useState } from 'react'
import type { CuratorStatus, SkillRow } from '../../../shared/ipc'
import {
  countSkills,
  describeCurator,
  describeDeleteConfirmation,
  describeReload,
  groupSkillsByCategory,
  SKILLS_EMPTY_HINT,
  type SkillCategory
} from './skills-pure'

interface NodeDetail {
  ok: boolean
  message?: string
  content?: string
}

/** "Научить агента" — `/learn <тема>` from the UI (task 1.6.B3.13).
 *
 * Their dispatcher answers `{type:'send', message}`: a prompt they want
 * submitted as a normal user turn. It goes through `submitPrompt`, the same
 * channel the composer uses — a second submit path would be a second place for
 * the turn lifecycle to diverge.
 *
 * Any other `type` is NOT sent. Quietly submitting an unexpected shape as a
 * user turn is exactly the failure worth avoiding here. */
function LearnControl({
  busy,
  onError,
  onNotice,
  onBusyChange
}: {
  busy: boolean
  onError: (message: string | undefined) => void
  onNotice: (message: string | undefined) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [topic, setTopic] = useState('')

  async function learn(): Promise<void> {
    const text = topic.trim()
    if (text === '') return
    onBusyChange(true)
    onError(undefined)
    try {
      const result = await window.aecpilot.dispatchLearn(text)
      if (result.type !== 'send' || !result.message) {
        onError(
          `Ядро ответило типом «${result.type ?? 'без типа'}» вместо «send» — ход не отправлен.`
        )
        return
      }
      await window.aecpilot.submitPrompt(result.message)
      setTopic('')
      onNotice('Ход на обучение отправлен — смотрите переписку.')
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <div className="settings-section__confirm-actions">
      <input
        type="text"
        value={topic}
        placeholder="чему научить агента"
        aria-label="Тема обучения"
        onChange={(event) => setTopic(event.target.value)}
        disabled={busy}
      />
      <button type="button" onClick={() => void learn()} disabled={busy || topic.trim() === ''}>
        Научить
      </button>
    </div>
  )
}

/** "Скилы" in the Агент hub (tasks 1.6.B3.3–B3.9). Contract:
 * specs/agent-skills.md.
 *
 * The list comes over REST because the RPC one carries only names; everything
 * else stays on RPC. Both choices are measured, not assumed — see the probe
 * note in shared/gateway/types.ts.
 *
 * Enabled state is shown and never written: owner decision B3-2. */
export default function SkillsPanel() {
  const [rows, setRows] = useState<SkillRow[] | undefined>(undefined)
  const [curator, setCurator] = useState<CuratorStatus | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [openSkill, setOpenSkill] = useState<string | undefined>(undefined)
  const [detail, setDetail] = useState<NodeDetail | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [confirmEdit, setConfirmEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>(undefined)

  async function load(): Promise<void> {
    setRows(await window.aecpilot.listSkills())
  }

  useEffect(() => {
    let mounted = true
    window.aecpilot
      .listSkills()
      .then((result) => {
        if (mounted) setRows(result)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      })
    // The curator plate is drawn whether or not this succeeds — its first
    // sentence is true regardless, and a failed status must not hide it.
    window.aecpilot
      .getCuratorStatus()
      .then((status) => {
        if (mounted) setCurator(status)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  async function openDetail(name: string): Promise<void> {
    if (openSkill === name) {
      setOpenSkill(undefined)
      setDetail(undefined)
      return
    }
    setOpenSkill(name)
    setDetail(undefined)
    setConfirmEdit(false)
    try {
      const result = await window.aecpilot.getLearningNode(name)
      setDetail(result)
      setDraft(result.content ?? '')
    } catch (err) {
      setDetail({ ok: false, message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function reload(): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.reloadSkills()
      setNotice(describeReload(result))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(name: string): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.editLearningNode({
        id: name,
        content: draft,
        confirmed: true
      })
      setConfirmEdit(false)
      if (!result.ok) {
        // The draft is deliberately left in the editor: losing the user's text
        // because the core refused it would be the worse failure.
        setError(result.message ?? 'ядро не приняло правку')
        return
      }
      const fresh = await window.aecpilot.getLearningNode(name)
      setDetail(fresh)
      setDraft(fresh.content ?? '')
      setNotice(`Скил «${name}» обновлён.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeNode(id: string): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.deleteLearningNode({ id, confirmed: true })
      setConfirmDelete(undefined)
      if (!result.ok) {
        setError(result.message ?? 'ядро отказалось удалять узел')
        return
      }
      setNotice(result.message ?? 'Готово.')
      setOpenSkill(undefined)
      setDetail(undefined)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const categories: SkillCategory[] = groupSkillsByCategory(rows)
  const total = countSkills(categories)

  return (
    <div className="skills-panel">
      <div className="settings-popover__warning">{describeCurator(curator)}</div>

      {error && <div className="settings-popover__error">{error}</div>}
      {notice && <div className="settings-section__hint">{notice}</div>}

      <div className="settings-section__head">
        <div className="settings-section__hint">Скилов: {total}</div>
        <button
          type="button"
          className="settings-popover__link-btn"
          onClick={() => void reload()}
          disabled={busy}
        >
          {busy ? 'перечитываю…' : 'Перечитать скилы'}
        </button>
      </div>

      <LearnControl busy={busy} onError={setError} onNotice={setNotice} onBusyChange={setBusy} />

      {rows && total === 0 && <div className="settings-section__empty">{SKILLS_EMPTY_HINT}</div>}

      {categories.map((category) => (
        <div key={category.name}>
          <div className="settings-popover__section-title">{category.name}</div>
          <ul className="skill-list">
            {category.skills.map((skill) => (
              <li key={skill.name} className="skill-row">
                <div className="skill-row__head">
                  <button
                    type="button"
                    className="skill-row__name"
                    aria-expanded={openSkill === skill.name}
                    onClick={() => void openDetail(skill.name)}
                  >
                    {skill.name}
                  </button>
                  {skill.enabled === false && <span className="skill-row__state">выключен</span>}
                  <button
                    type="button"
                    className="settings-popover__link-btn"
                    onClick={() => setConfirmDelete(skill.name)}
                    disabled={busy}
                  >
                    В архив
                  </button>
                </div>
                {skill.description && <div className="skill-row__desc">{skill.description}</div>}

                {openSkill === skill.name && (
                  <div className="skill-row__detail">
                    {detail === undefined && <div className="settings-section__hint">читаю…</div>}
                    {detail && !detail.ok && (
                      <div className="settings-popover__error">
                        {detail.message ?? 'содержимое недоступно'}
                      </div>
                    )}
                    {detail?.ok && (
                      <>
                        <textarea
                          value={draft}
                          rows={12}
                          onChange={(event) => setDraft(event.target.value)}
                          aria-label={`Содержимое скила ${skill.name}`}
                          disabled={busy}
                        />
                        {!confirmEdit && (
                          <div className="settings-section__confirm-actions">
                            <button
                              type="button"
                              onClick={() => setConfirmEdit(true)}
                              disabled={busy || draft === (detail.content ?? '')}
                            >
                              Сохранить
                            </button>
                          </div>
                        )}
                        {confirmEdit && (
                          <div
                            className="settings-section__confirm"
                            role="alertdialog"
                            aria-label="Сохранить скил"
                          >
                            <div>
                              Перезаписать SKILL.md скила «{skill.name}»? Агент читает его как
                              инструкцию.
                            </div>
                            <div className="settings-section__confirm-actions">
                              <button
                                type="button"
                                onClick={() => void saveEdit(skill.name)}
                                disabled={busy}
                              >
                                Перезаписать
                              </button>
                              <button
                                type="button"
                                className="settings-popover__link-btn"
                                onClick={() => setConfirmEdit(false)}
                                disabled={busy}
                              >
                                Отмена
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {confirmDelete && (
        <div className="settings-section__confirm" role="alertdialog" aria-label="Убрать узел">
          <div>{describeDeleteConfirmation(confirmDelete)}</div>
          <div className="settings-section__confirm-actions">
            <button type="button" onClick={() => void removeNode(confirmDelete)} disabled={busy}>
              Убрать
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
