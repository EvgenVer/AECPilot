// The project menu — which project is open, and how to leave it.
//
// It lives in their status bar because that is where "what am I working on"
// belongs in their shell, and because the answer has to be visible without
// opening anything: every file operation, every scan and every agent turn is
// scoped to this vault, and a user who has forgotten which one is open can do
// real damage in the wrong project.

import { useStore } from '@nanostores/react'

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

import { useProjectActions } from './use-project-actions'

export function ProjectMenu() {
  const t = useAecT()
  const continuity = useStore($cronContinuity)
  const { project, otherRecents, error, open, pickAndOpen, create, openSettings, dialogs } =
    useProjectActions()

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
          <DropdownMenuItem onSelect={create}>{t('welcome.create')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void pickAndOpen()}>
            {t('welcome.open')}
          </DropdownMenuItem>

          {/* Задача 5.14. Настройки живут в `project.json` и путешествуют
              вместе с проектом, поэтому вход к ним — здесь, у имени проекта, а
              не в настройках приложения: там они читались бы как общие. */}
          {project && (
            <DropdownMenuItem onSelect={openSettings}>
              {t('project.settingsTitle')}
            </DropdownMenuItem>
          )}

          {otherRecents.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t('welcome.recentTitle')}</DropdownMenuLabel>
              {otherRecents.map((entry) => (
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

      {dialogs}
    </>
  )
}
