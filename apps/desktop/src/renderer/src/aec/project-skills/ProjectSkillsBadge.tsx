// Значок инструкций проекта (задача 3.8а): доверены ли они и сколько их.
// Стоит в строке состояния и на странице «Проект» (задача 3H.28) — во втором
// месте потому, что в простом режиме строки состояния нет.

import { useStore } from '@nanostores/react'

import { useAecT } from '../../shared/i18n'

import { $projectSkills, $projectSkillsOpen } from './store'

export function ProjectSkillsBadge(): React.JSX.Element | null {
  const view = useStore($projectSkills)
  const label = useAecT()

  if (view.state === 'none') return null

  const text =
    view.state === 'trusted'
      ? label('projectSkills.badgeTrusted', view.skills.length)
      : label('projectSkills.badgeUntrusted', view.skills.length)

  return (
    <button
      className={
        view.state === 'trusted'
          ? 'text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)'
          : 'text-xs text-(--ui-text-danger)'
      }
      onClick={() => $projectSkillsOpen.set(true)}
      title={label('projectSkills.badgeHint')}
      type="button"
    >
      {text}
    </button>
  )
}
