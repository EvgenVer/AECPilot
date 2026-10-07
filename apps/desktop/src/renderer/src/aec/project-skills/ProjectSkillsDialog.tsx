// Что человек видит, решая, доверять ли инструкциям проекта (задача 3.8а, UR29).
//
// ТРИ ВЕЩИ НА КАЖДЫЙ ФАЙЛ, и все три обязательны: как называется, что о себе
// говорит и какие инструменты просит. Последнее — то же требование, что у
// установки из хаба (UR23): скил без ограничения получает всё, что есть у
// агента, и узнать об этом надо ДО, а не после.
//
// ОТДЕЛЬНО ПРО «ИЗМЕНИЛОСЬ». Когда доверие уже выдавалось, а содержимое
// разошлось, наверху перечисляется, ЧТО именно разошлось. Без этого «пересмотрите
// доверие» — это просьба перечитать всё заново, и человек нажмёт «доверять», не
// читая; со списком он смотрит один файл.

import { useStore } from '@nanostores/react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { $projectSkills, $projectSkillsOpen, trustProjectSkills } from './store'

export default function ProjectSkillsDialog(): React.JSX.Element | null {
  const view = useStore($projectSkills)
  const open = useStore($projectSkillsOpen)
  const t = useAecT()

  if (!open || view.state === 'none') return null

  const moved = view.difference
  const title =
    view.state === 'changed' ? t('projectSkills.changedTitle') : t('projectSkills.title')

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => $projectSkillsOpen.set(false)}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">{title}</h2>

        <p className="text-xs text-(--ui-text-secondary)">{t('projectSkills.lead')}</p>

        {moved && (
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-(--ui-text-danger)">
            {moved.changed.map((rel) => (
              <li key={`c-${rel}`}>{t('projectSkills.wasChanged', rel)}</li>
            ))}
            {moved.added.map((rel) => (
              <li key={`a-${rel}`}>{t('projectSkills.wasAdded', rel)}</li>
            ))}
            {moved.removed.map((rel) => (
              <li key={`r-${rel}`}>{t('projectSkills.wasRemoved', rel)}</li>
            ))}
          </ul>
        )}

        {view.shadowed.length > 0 && (
          <p className="rounded bg-(--ui-bg-tertiary) p-2 text-xs text-(--ui-text-danger)">
            {t('projectSkills.shadowed', view.shadowed.join(', '))}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {view.skills.map((skill) => (
            <li className="flex flex-col gap-1 border-t border-(--ui-border) pt-3" key={skill.rel}>
              <span className="text-xs font-medium text-(--ui-text-primary)">{skill.name}</span>
              {skill.description !== '' && (
                <span className="text-xs text-(--ui-text-secondary)">{skill.description}</span>
              )}
              <span className="text-xs text-(--ui-text-secondary)">
                {skill.tools.length === 0
                  ? t('projectSkills.toolsUnrestricted')
                  : t('projectSkills.tools', skill.tools.join(', '))}
              </span>
              <span className="font-mono text-[10px] text-(--ui-text-tertiary)">{skill.rel}</span>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2">
          {view.state === 'trusted' || view.state === 'changed' ? (
            <Button onClick={() => void trustProjectSkills(false)} size="sm" variant="ghost">
              {t('projectSkills.revoke')}
            </Button>
          ) : (
            <Button onClick={() => $projectSkillsOpen.set(false)} size="sm" variant="ghost">
              {t('projectSkills.later')}
            </Button>
          )}
          <Button onClick={() => void trustProjectSkills(true)} size="sm">
            {t('projectSkills.trust')}
          </Button>
        </div>
      </div>
    </div>
  )
}
