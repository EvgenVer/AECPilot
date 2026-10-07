// Где человек находит выбор провайдеров RAG и памяти (задача 3G.47, D-172).
//
// Тот же приём, что у доступов Microsoft Graph (3E.9а): команда палитры — вход для
// того, у кого ничего не настроено. Само окно смонтировано в корне (`main.tsx`),
// а не в строке состояния: её донор прячет в простом режиме и по Ctrl+Shift+S, и
// окно пропадало вместе с ней (D-189, задача 3H.7).

import { PALETTE_AREA, type PaletteContribution } from '../../donor/app/command-palette/contrib'
import { registry } from '../../donor/contrib/registry'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { openDataProviders } from './store'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

export function registerDataProviders(): void {
  registry.register({
    id: 'aec-data-providers',
    area: PALETTE_AREA,
    source: 'core',
    data: {
      id: 'aec.data.providers',
      // Свойство, а не значение — регистрация идёт до выбора языка (D-103).
      get label() {
        return t('dataProviders.command')
      },
      keywords: [
        'rag',
        'index',
        'memory',
        'embeddings',
        'provider',
        'индекс',
        'память',
        'эмбеддинги',
        'провайдер',
        'ключ'
      ],
      run: openDataProviders
    } satisfies PaletteContribution
  })
}
