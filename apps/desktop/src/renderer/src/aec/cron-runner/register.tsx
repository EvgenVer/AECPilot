// Задача 3.6а: где человек управляет запуском задач по расписанию.
//
// Два места, и оба нужны. Строка состояния показывает, что расписания включены
// и живы ли они, — и гасит их одним щелчком. Команда в палитре — вход для того,
// кто хочет включить их, ещё не заведя ни одной задачи (строка состояния тогда
// не показана, а прятать единственный выключатель за созданием задачи значило
// бы спрятать его совсем).
//
// Третий вход — предложение в тот момент, когда человек только что завёл задачу
// и ждёт, что она сработает: `aec/cron-tick-notice`.

import { registry } from '../../donor/contrib/registry'
import { PALETTE_AREA, type PaletteContribution } from '../../donor/app/command-palette/contrib'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { CronRunnerBadge } from './CronRunnerBadge'
import { $cronRunner, setCronRunner, watchCronRunner } from './store'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

watchCronRunner()

registry.register({
  id: 'aec-cron-runner',
  area: STATUSBAR_AREAS.left,
  source: 'core',
  order: -96,
  render: () => <CronRunnerBadge />
})

registry.register({
  id: 'aec-cron-runner-toggle',
  area: PALETTE_AREA,
  source: 'core',
  data: {
    id: 'aec.cron.runner',
    // Свойство, а не значение (D-103). Строки палитры регистрируются при
    // импорте модуля — до того, как выбран язык, — и `t()`, посчитанный здесь
    // же, навсегда застывает на английском умолчании. Их палитра расплющивает
    // запись (`{...c.data}`) на каждой отрисовке, поэтому свойство считается
    // заново и приходит на языке, который стоит СЕЙЧАС. У соседнего `detail`
    // та же причина — там она уже была учтена функцией.
    get label() {
      return t('cron.runner.command')
    },
    keywords: ['cron', 'schedule', 'расписание', 'задачи', 'планировщик'],
    detail: () => ($cronRunner.get().enabled ? t('cron.runner.on') : t('cron.runner.off')),
    detailVariant: 'state',
    run: () => void setCronRunner(!$cronRunner.get().enabled)
  } satisfies PaletteContribution
})
