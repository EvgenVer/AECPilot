// "Create project" — ours, because the donor has no notion of a project: their
// desktop opens a working directory, ours creates and owns a vault. The logic
// is the one task 1.3/1.5.4 measured against main (pick a folder → name it →
// generate the vault, non-empty folders get only what they are missing and
// existing files are never touched — specs/workspace-sources.md). What changed
// in task 1.8.18 is the skin: their Button, their Tailwind variables, their
// i18n. No CSS of our own.

import { useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import { CloseOnEscape } from '../CloseOnEscape'

export default function CreateProjectDialog({
  onClose,
  initialDirPath,
  initialName
}: {
  onClose: () => void
  initialDirPath?: string
  initialName?: string
}) {
  const t = useAecT()
  // A pre-filled folder means the user picked one that turned out not to be a
  // project yet — the dialog then reads as "initialize", not "create".
  const isInit = Boolean(initialDirPath)
  const [dirPath, setDirPath] = useState<string | undefined>(initialDirPath)
  const [name, setName] = useState(initialName ?? '')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  // The target already carries its own AGENTS.md/.aecpilot: a two-step confirm,
  // after which we add only the missing structure around those files.
  const [conflicts, setConflicts] = useState<string[] | undefined>(undefined)

  async function handlePick(): Promise<void> {
    setPicking(true)
    setError(undefined)
    try {
      const picked = await window.aecpilot.pickProjectDirectory()
      if (picked) setDirPath(picked)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPicking(false)
    }
  }

  async function submitCreate(confirmed: boolean): Promise<void> {
    if (!dirPath || name.trim().length === 0) return
    setCreating(true)
    setError(undefined)
    try {
      const result = await window.aecpilot.createProject(dirPath, name, confirmed)
      if ('needsConfirm' in result) {
        setConflicts(result.needsConfirm)
        return
      }
      setConflicts(undefined)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const canCreate = Boolean(dirPath) && name.trim().length > 0 && !creating
  const title = isInit ? t('project.initTitle') : t('project.createTitle')

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <CloseOnEscape onClose={onClose} />
      <div
        aria-label={title}
        aria-modal="true"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-(--ui-text-primary)">{title}</h2>
          <Button disabled={creating} onClick={onClose} size="icon-xs" variant="ghost">
            <span aria-hidden="true">✕</span>
            <span className="sr-only">{t('common.close')}</span>
          </Button>
        </div>

        <label className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
          {t('project.nameLabel')}
          <input
            className="rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary) outline-none focus-visible:ring-[0.1875rem] focus-visible:ring-ring/50"
            disabled={creating}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('project.namePlaceholder')}
            type="text"
            value={name}
          />
        </label>

        <div className="flex flex-col gap-1.5 text-xs text-(--ui-text-secondary)">
          <span>{t('project.folderLabel')}</span>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-[4px] bg-(--ui-bg-quaternary) px-2 py-1.5 text-sm text-(--ui-text-primary)">
              {dirPath ?? t('project.folderUnset')}
            </div>
            <Button
              disabled={picking || creating}
              onClick={() => void handlePick()}
              variant="secondary"
            >
              {picking ? t('project.picking') : t('project.pick')}
            </Button>
          </div>
        </div>

        {error && <div className="text-xs text-destructive">{error}</div>}

        {conflicts && (
          <div className="flex flex-col gap-1 text-xs text-(--ui-text-secondary)">
            {conflicts.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {conflicts ? (
            <>
              <Button disabled={creating} onClick={() => setConflicts(undefined)} variant="text">
                {t('common.cancel')}
              </Button>
              <Button disabled={creating} onClick={() => void submitCreate(true)}>
                {creating ? t('project.initializing') : t('project.initAnyway')}
              </Button>
            </>
          ) : (
            <>
              <Button disabled={creating} onClick={onClose} variant="text">
                {t('common.cancel')}
              </Button>
              <Button disabled={!canCreate} onClick={() => void submitCreate(false)}>
                {creating
                  ? isInit
                    ? t('project.initializing')
                    : t('project.creating')
                  : isInit
                    ? t('project.init')
                    : t('project.create')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
