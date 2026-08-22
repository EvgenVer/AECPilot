// Роестр входит в их оболочку тем же путём, что и остальные наши поверхности —
// через их реестр вкладов, а не правкой их разметки (задача 3C.1).
//
// Место — левая колонка, рядом с проводником: «с кем я работаю» и «над чем я
// работаю» — два вопроса одного взгляда. Панель сворачиваемая: у человека с
// одним специалистом она занимать место не должна.

import { registry } from '../../donor/contrib/registry'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { RosterPanel } from './RosterPanel'
import { registerCanonicalChatGuard } from './register-canonical-guard'

const title = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'roster.title', [])

registry.register({
  id: 'aec-roster',
  area: 'panes',
  source: 'core',
  title: title(),
  data: {
    placement: 'left',
    collapsible: true,
    width: '240px',
    minWidth: '180px',
    maxWidth: '420px'
  },
  render: () => <RosterPanel />
})

// Задача 3C.4. Сторож «нового чата» в постоянном чате специалиста. Регистрируется
// здесь же, чтобы жил ровно столько, сколько оболочка.
registerCanonicalChatGuard()
