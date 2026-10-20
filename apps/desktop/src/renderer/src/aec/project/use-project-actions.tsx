// Действия с проектом — одни на меню в строке состояния и на страницу «Проект»
// (задача 3H.28, D-191): создать, открыть, недавние, настройки. Окна создания и
// настроек хук отдаёт готовым элементом, чтобы оба места вели себя одинаково.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import CreateProjectDialog from './CreateProjectDialog'
import ProjectSettingsDialog from './ProjectSettingsDialog'
import { pickProjectFolder } from './pick-project-folder'

const CURRENT_PROJECT_KEY = ['aec', 'current-project'] as const
const RECENTS_KEY = ['aec', 'recent-projects'] as const

export function useProjectActions() {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ dirPath?: string; name?: string } | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const { data: project } = useQuery({
    queryKey: CURRENT_PROJECT_KEY,
    queryFn: () => window.aecpilot.getCurrentProject()
  })
  const { data: recents } = useQuery({
    queryKey: RECENTS_KEY,
    queryFn: () => window.aecpilot.listRecentProjects()
  })

  const open = useCallback(
    async (vaultPath: string) => {
      setError(undefined)
      const result = await window.aecpilot.openProject(vaultPath)
      if ('needsInit' in result) {
        // Same rule as the Welcome screen: a folder that is not a project yet
        // opens the create dialog pre-filled instead of erroring.
        setDialog({ dirPath: vaultPath, name: result.suggestedName })
        return
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      await queryClient.invalidateQueries()
    },
    [queryClient]
  )

  const pickAndOpen = useCallback(async () => {
    const picked = await pickProjectFolder()
    if (picked) await open(picked)
  }, [open])

  const dialogs = (
    <>
      {dialog && (
        <CreateProjectDialog
          initialDirPath={dialog.dirPath}
          initialName={dialog.name}
          onClose={() => {
            setDialog(undefined)
            void queryClient.invalidateQueries()
          }}
        />
      )}

      {settingsOpen && <ProjectSettingsDialog onClose={() => setSettingsOpen(false)} />}
    </>
  )

  return {
    project,
    otherRecents: (recents ?? []).filter((entry) => entry.vaultPath !== project?.vaultPath),
    error,
    open,
    pickAndOpen,
    create: () => setDialog({}),
    openSettings: () => setSettingsOpen(true),
    dialogs
  }
}
