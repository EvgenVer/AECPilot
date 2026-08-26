// The project menu — which project is open, and how to leave it.
//
// It lives in their status bar because that is where "what am I working on"
// belongs in their shell, and because the answer has to be visible without
// opening anything: every file operation, every scan and every agent turn is
// scoped to this vault, and a user who has forgotten which one is open can do
// real damage in the wrong project.

import { useStore } from '@nanostores/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { Button } from '../../donor/components/ui/button'
import { Codicon } from '../../donor/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '../../donor/components/ui/dropdown-menu'
import { useAecT } from '../../shared/i18n'
import { $cronContinuity, setCronContinuity } from '../cron-continuity/store'

import CreateProjectDialog from './CreateProjectDialog'
import ProjectLanguagesDialog from './ProjectLanguagesDialog'

const CURRENT_PROJECT_KEY = ['aec', 'current-project'] as const
const RECENTS_KEY = ['aec', 'recent-projects'] as const

export function ProjectMenu() {
  const t = useAecT()
  const continuity = useStore($cronContinuity)
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<{ dirPath?: string; name?: string } | undefined>(undefined)
  const [languages, setLanguages] = useState(false)
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
    const picked = await window.aecpilot.pickProjectDirectory()
    if (picked) await open(picked)
  }, [open])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="ghost">
            <Codicon name="folder" />
            <span className="max-w-40 truncate">{project?.name ?? t('project.none')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {project && (
            <>
              <DropdownMenuLabel className="max-w-72 truncate" title={project.vaultPath}>
                {project.vaultPath}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setDialog({})}>{t('welcome.create')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void pickAndOpen()}>
            {t('welcome.open')}
          </DropdownMenuItem>

          {/* Задача 5.14. Настройки живут в `project.json` и путешествуют
              вместе с проектом, поэтому вход к ним — здесь, у имени проекта, а
              не в настройках приложения: там они читались бы как общие. */}
          {project && (
            <DropdownMenuItem onSelect={() => setLanguages(true)}>
              {t('project.langTitle')}
            </DropdownMenuItem>
          )}

          {(recents ?? []).filter((entry) => entry.vaultPath !== project?.vaultPath).length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('welcome.recentTitle')}</DropdownMenuLabel>
              {(recents ?? [])
                .filter((entry) => entry.vaultPath !== project?.vaultPath)
                .map((entry) => (
                  <DropdownMenuItem
                    key={entry.vaultPath}
                    onSelect={() => void open(entry.vaultPath)}
                    title={entry.vaultPath}
                  >
                    <span className="max-w-72 truncate">{entry.name}</span>
                  </DropdownMenuItem>
                ))}
            </>
          )}

          {/* Задача 3.5а. Общий переключатель, а не галочка на задаче: поля
              `context_from` нет в их редакторе расписаний, а вшить его туда
              значило бы завести пятый вид правки вендорного файла. Текст
              описывает последствие, а не имя поля. */}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={continuity}
            onCheckedChange={(next) => void setCronContinuity(next === true)}
            title={t('cron.continuityHint')}
          >
            <span className="max-w-72">{t('cron.continuityLabel')}</span>
          </DropdownMenuCheckboxItem>

          {error && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="max-w-72 text-destructive">{error}</DropdownMenuLabel>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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

      {languages && <ProjectLanguagesDialog onClose={() => setLanguages(false)} />}
    </>
  )
}
