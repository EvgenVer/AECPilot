// Побочный вопрос входит в оболочку тем же путём, что и остальные наши
// поверхности, — через их реестр вкладов (задача 3.B3ж).
//
// Место — правая колонка, рядом с лентой: вопрос задаётся ПРО ленту, и держать
// его в другом углу окна значило бы заставлять переводить взгляд туда-обратно.
//
// Панель сворачиваемая, но НЕ свёрнутая с самого начала: в их контракте вклада
// такого поля нет (`data` знает `collapsible`, `dock`, `revealAliases` и
// размеры — «начать свёрнутым» среди них не значится). Заводить ради этого
// своё состояние не стали: человек сворачивает её один раз, а размеры и
// свёрнутость их раскладка запоминает между запусками (UR12).

import { registry } from '../../donor/contrib/registry'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { BtwPanel } from './BtwPanel'

const title = (): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), 'btw.title', [])

registry.register({
  id: 'aec-btw',
  area: 'panes',
  source: 'core',
  title: title(),
  data: {
    placement: 'right',
    collapsible: true,
    width: '260px',
    minWidth: '200px',
    maxWidth: '440px'
  },
  render: () => <BtwPanel />
})
