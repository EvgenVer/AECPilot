// The project gate — ours, and the reason it exists is structural: the donor's
// app opens a working directory, ours opens a VAULT, and main will not hand the
// agent a working directory until a project is chosen. So this screen stands in
// front of their application and steps aside once `project:opened` fires.
//
// Behaviour is what tasks 1.3–1.5.4 measured: create a project, open an
// existing one, re-open a recent one, and — the case that is easy to get wrong
// — picking a folder that is not a project yet opens the create dialog
// pre-filled instead of erroring.

import { useEffect, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import type { RecentProject } from '../../../../shared/ipc'

import CreateProjectDialog from './CreateProjectDialog'

export default function Welcome() {
  const t = useAecT()
  const [projectDialog, setProjectDialog] = useState<
    { dirPath?: string; name?: string } | undefined
  >(undefined)
  const [recents, setRecents] = useState<RecentProject[]>([])
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<{ vaultPath: string; message: string } | undefined>(
    undefined
  )

  useEffect(() => {
    let mounted = true
    void window.aecpilot.listRecentProjects().then((list) => {
      if (mounted) setRecents(list)
    })
    return () => {
      mounted = false
    }
  }, [])

  async function openVault(vaultPath: string): Promise<void> {
    setOpening(true)
    setOpenError(undefined)
    try {
      const result = await window.aecpilot.openProject(vaultPath)
      if ('needsInit' in result) {
        setProjectDialog({ dirPath: vaultPath, name: result.suggestedName })
        return
      }
      if (!result.ok) setOpenError({ vaultPath, message: result.error })
    } finally {
      setOpening(false)
    }
  }

  async function handlePickAndOpen(): Promise<void> {
    setOpenError(undefined)
    const picked = await window.aecpilot.pickProjectDirectory()
    if (picked) await openVault(picked)
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-auto bg-(--ui-bg-primary) text-(--ui-text-primary)">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
        <div>
          <div className="text-lg font-semibold">AECPilot</div>
          <div className="text-sm text-(--ui-text-secondary)">{t('welcome.tagline')}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="flex cursor-pointer flex-col gap-1 rounded-lg bg-(--ui-bg-secondary) p-4 text-left transition-colors hover:bg-(--chrome-action-hover)"
            onClick={() => setProjectDialog({})}
            type="button"
          >
            <div className="text-sm font-medium">{t('welcome.create')}</div>
            <div className="text-xs text-(--ui-text-secondary)">{t('welcome.createHint')}</div>
          </button>
          <button
            className="flex cursor-pointer flex-col gap-1 rounded-lg bg-(--ui-bg-secondary) p-4 text-left transition-colors hover:bg-(--chrome-action-hover) disabled:cursor-default disabled:opacity-50"
            disabled={opening}
            onClick={() => void handlePickAndOpen()}
            type="button"
          >
            <div className="text-sm font-medium">{t('welcome.open')}</div>
            <div className="text-xs text-(--ui-text-secondary)">{t('welcome.openHint')}</div>
          </button>
        </div>

        {openError && !recents.some((project) => project.vaultPath === openError.vaultPath) && (
          <div className="text-xs text-destructive">{openError.message}</div>
        )}

        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-(--ui-text-secondary)">
            {t('welcome.recentTitle')}
          </div>
          {recents.length === 0 ? (
            <div className="text-xs text-(--ui-text-secondary)">{t('welcome.recentEmpty')}</div>
          ) : (
            <ul className="flex flex-col gap-1">
              {recents.map((project) => (
                <li className="flex flex-col" key={project.vaultPath}>
                  <Button
                    className="h-auto justify-start px-2 py-1.5 text-left"
                    disabled={opening}
                    onClick={() => void openVault(project.vaultPath)}
                    title={project.vaultPath}
                    variant="ghost"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-(--ui-text-primary)">
                        {project.name}
                      </span>
                      <span className="truncate text-xs text-(--ui-text-secondary)">
                        {project.vaultPath}
                      </span>
                    </span>
                  </Button>
                  {openError?.vaultPath === project.vaultPath && (
                    <div className="px-2 text-xs text-destructive">{openError.message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {projectDialog && (
        <CreateProjectDialog
          initialDirPath={projectDialog.dirPath}
          initialName={projectDialog.name}
          onClose={() => setProjectDialog(undefined)}
        />
      )}
    </div>
  )
}
