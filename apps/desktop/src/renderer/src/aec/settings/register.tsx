// Где человек находит доступы Microsoft Graph (задача 3E.9а).
//
// В ПАЛИТРЕ, а не в строке состояния: это настройка, к которой заходят один раз
// на объект, а место в строке состояния стоит дорого — там живёт то, от чего
// зависит каждый ответ (проект, индекс, память). Тот же приём, что у выключателя
// расписаний: команда палитры — вход для того, у кого ещё ничего не настроено.

import { PALETTE_AREA, type PaletteContribution } from '../../donor/app/command-palette/contrib'
import { registry } from '../../donor/contrib/registry'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { $graphAccessOpen, refreshGraphAccess } from './graph-access-store'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

export function registerGraphAccess(): void {
  registry.register({
    id: 'aec-graph-access',
    area: PALETTE_AREA,
    source: 'core',
    data: {
      id: 'aec.graph.access',
      // Свойство, а не значение — та же причина, что у выключателя расписаний
      // (D-103): регистрация идёт до выбора языка, и посчитанная здесь строка
      // застыла бы на английском умолчании.
      get label() {
        return t('graphAccess.command')
      },
      keywords: ['microsoft', 'graph', 'teams', 'outlook', 'onedrive', 'доступы', 'граф'],
      run: () => {
        void refreshGraphAccess()
        $graphAccessOpen.set(true)
      }
    } satisfies PaletteContribution
  })

  // Само окно смонтировано в корне (`main.tsx`): его открывает команда, а не
  // компонент, и жить в строке состояния, которую донор прячет, оно не может
  // (D-189, задача 3H.7).
}
