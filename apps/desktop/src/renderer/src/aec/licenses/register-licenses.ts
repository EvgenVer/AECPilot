// Задача T43.2 (SPEC A8, C3): лицензии сторонних компонентов — команда Ctrl+K. Файл
// открывает главный процесс программой Windows для текста; раздела в «О программе»
// нет: страница донора правится только шестью разрешёнными правками, и ни одна не про
// новый раздел.

import { PALETTE_AREA, type PaletteContribution } from '../../donor/app/command-palette/contrib'
import { registry } from '../../donor/contrib/registry'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

export async function openThirdPartyNotices(): Promise<void> {
  const result = await window.aecpilot.openThirdPartyNotices()
  if (!result.ok) notify({ kind: 'error', title: t('licenses.failedTitle'), message: result.error })
}

export function registerLicenses(): void {
  registry.register({
    id: 'aec-licenses-open',
    area: PALETTE_AREA,
    source: 'core',
    data: {
      id: 'aec.licenses.open',
      // Свойство, а не значение — регистрация идёт до выбора языка (D-103).
      get label() {
        return t('licenses.command')
      },
      keywords: ['license', 'licenses', 'notices', 'about', 'лицензии', 'лицензия', 'о программе'],
      run: () => void openThirdPartyNotices()
    } satisfies PaletteContribution
  })
}
