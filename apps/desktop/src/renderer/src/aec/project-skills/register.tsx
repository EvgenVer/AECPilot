// Задача 3.8а: где человек узнаёт об инструкциях проекта и управляет доверием.
//
// ДВА МЕСТА, и оба по делу. Уведомление при открытии проекта — потому что это
// единственный момент, когда состояние меняется само и человек может об этом не
// знать: «недоверенный проект даёт заметное уведомление, а не тишину» — прямая
// формулировка задачи. Строка состояния — потому что решение обратимо, и отзыв
// доверия должен быть под рукой, а не только в тот момент, когда о нём спросили.

import { useStore } from '@nanostores/react'

import { registry } from '../../donor/contrib/registry'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'
import { useAecT } from '../../shared/i18n'

import { $projectSkills, $projectSkillsOpen, refreshProjectSkills } from './store'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

function announce(state: string): void {
  if (state === 'untrusted') {
    notify({
      kind: 'warning',
      title: t('projectSkills.foundTitle'),
      message: t('projectSkills.foundBody'),
      action: { label: t('projectSkills.review'), onClick: () => $projectSkillsOpen.set(true) }
    })
    return
  }

  if (state === 'changed') {
    notify({
      kind: 'error',
      title: t('projectSkills.changedTitle'),
      message: t('projectSkills.changedBody'),
      action: { label: t('projectSkills.review'), onClick: () => $projectSkillsOpen.set(true) }
    })
  }
}

void refreshProjectSkills().then((view) => announce(view.state))
window.aecpilot.onProjectOpened(() => {
  void refreshProjectSkills().then((view) => announce(view.state))
})

function ProjectSkillsBadge(): React.JSX.Element | null {
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

registry.register({
  id: 'aec-project-skills',
  area: STATUSBAR_AREAS.left,
  source: 'core',
  order: -94,
  render: () => <ProjectSkillsBadge />
})
