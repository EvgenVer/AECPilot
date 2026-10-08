// Страница «Проект» (задача 3H.28, D-191, решение владельца 2026-10-08).
//
// В простом режиме донор прячет строку состояния, а с ней — меню проекта и
// значки инструкций и расписаний. Какой проект открыт, должно быть видно всегда:
// им ограничены все файловые операции, сканы и ходы агента. Их строка боковой
// панели умеет только вести на маршрут, поэтому вход — строка «Проект: <имя>»,
// а действия меню — здесь. Шапка — как у страницы «Индекс».

import { useStore } from '@nanostores/react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import { $cronContinuity, setCronContinuity } from '../cron-continuity/store'
import { CronRunnerBadge } from '../cron-runner/CronRunnerBadge'
import { ProjectSkillsBadge } from '../project-skills/ProjectSkillsBadge'

import { useProjectActions } from './use-project-actions'

export default function ProjectPage(): React.JSX.Element {
  const t = useAecT()
  const continuity = useStore($cronContinuity)
  const { project, otherRecents, error, open, pickAndOpen, create, openSettings, dialogs } =
    useProjectActions()

  return (
    <section
      aria-label={t('project.pageTitle')}
      className="flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)"
    >
      <div className="shrink-0 px-6 pb-2 pt-[calc(var(--titlebar-height)+0.5rem)]">
        <h1 className="text-base font-semibold text-(--ui-text-primary)">
          {project?.name ?? t('project.none')}
        </h1>
        {project && (
          <p className="truncate text-xs text-(--ui-text-secondary)" title={project.vaultPath}>
            {project.vaultPath}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} size="sm" variant="secondary">
              {t('welcome.create')}
            </Button>
            <Button onClick={() => void pickAndOpen()} size="sm" variant="secondary">
              {t('welcome.open')}
            </Button>
            {project && (
              <Button onClick={openSettings} size="sm" variant="secondary">
                {t('project.settingsTitle')}
              </Button>
            )}
          </div>

          {error && <p className="text-xs text-(--ui-text-danger)">{error}</p>}

          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-(--ui-text-primary)">
              {t('project.pageBadges')}
            </h2>
            <p className="text-xs text-(--ui-text-secondary)">{t('project.pageBadgesHint')}</p>
            <div className="flex flex-wrap gap-4">
              <ProjectSkillsBadge />
              <CronRunnerBadge />
            </div>
          </div>

          <label className="flex items-start gap-2 text-xs text-(--ui-text-primary)">
            <input
              checked={continuity}
              className="mt-0.5"
              onChange={(event) => void setCronContinuity(event.target.checked)}
              type="checkbox"
            />
            <span>
              {t('cron.continuityLabel')}
              <span className="block text-(--ui-text-secondary)">{t('cron.continuityHint')}</span>
            </span>
          </label>

          {otherRecents.length > 0 && (
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-(--ui-text-primary)">
                {t('welcome.recentTitle')}
              </h2>
              {otherRecents.map((entry) => (
                <Button
                  className="justify-start"
                  key={entry.vaultPath}
                  onClick={() => void open(entry.vaultPath)}
                  size="sm"
                  title={entry.vaultPath}
                  variant="ghost"
                >
                  <span className="truncate">{entry.name}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {dialogs}
    </section>
  )
}
