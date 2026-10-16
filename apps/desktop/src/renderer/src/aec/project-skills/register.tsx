// Задача 3.8а: где человек узнаёт об инструкциях проекта и управляет доверием.
//
// ДВА МЕСТА, и оба по делу. Уведомление при открытии проекта — потому что это
// единственный момент, когда состояние меняется само и человек может об этом не
// знать: «недоверенный проект даёт заметное уведомление, а не тишину» — прямая
// формулировка задачи. Строка состояния — потому что решение обратимо, и отзыв
// доверия должен быть под рукой, а не только в тот момент, когда о нём спросили.

import { registry } from '../../donor/contrib/registry'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { ProjectSkillsBadge } from './ProjectSkillsBadge'
import { $projectSkillsOpen, refreshProjectSkills } from './store'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

// `persistent` (донор 0.22.2, задача T20.10): при открытии проекта их код
// начинает новую сессию и снимает уведомления сессии (`clearNotifications`).
// Это уведомление — о проекте, а не о сессии: без флага его стирало раньше,
// чем человек успевал увидеть, и оставалась только надпись в строке состояния.
function announce(state: string): void {
  if (state === 'untrusted') {
    notify({
      kind: 'warning',
      persistent: true,
      title: t('projectSkills.foundTitle'),
      message: t('projectSkills.foundBody'),
      action: { label: t('projectSkills.review'), onClick: () => $projectSkillsOpen.set(true) }
    })
    return
  }

  if (state === 'changed') {
    notify({
      kind: 'error',
      persistent: true,
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

registry.register({
  id: 'aec-project-skills',
  area: STATUSBAR_AREAS.left,
  source: 'core',
  order: -94,
  render: () => <ProjectSkillsBadge />
})
