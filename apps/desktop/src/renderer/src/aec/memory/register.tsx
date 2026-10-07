// Где человек находит память агента (задачи 5.4 и 3H.8–3H.10).
//
// СТРАНИЦА В ОСНОВНОЙ ОБЛАСТИ и три входа к ней, ни один из которых не зависит
// от строки состояния (SPEC UR43, D-189): строка боковой панели без `tier` — видна
// и в простом режиме, — строка Ctrl+K и пункт «Настроек». Значок в строке
// состояния остаётся, пока она видна: память влияет на КАЖДЫЙ ответ — её текст
// уезжает в промпт каждого хода, — и место ей рядом с проектом и индексом.
//
// Подпись строки боковой панели их панель читает при перестройке области,
// поэтому смена языка перерегистрирует строку — приём их плагина канбана.

import { PALETTE_AREA, type PaletteContribution } from '../../donor/app/command-palette/contrib'
import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type RouteContribution,
  type SidebarNavContribution
} from '../../donor/app/routes'
import { registry } from '../../donor/contrib/registry'
import { getRuntimeI18nLocale, subscribeRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { STATUSBAR_AREAS } from '../../donor/sdk'
import { useAecT } from '../../shared/i18n'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'
import { MEMORY_PAGE } from '../workspace-pages'

import MemoryPage from './MemoryPage'
import { openMemoryScreen } from './store'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

function MemoryBadge(): React.JSX.Element {
  const t = useAecT()

  return (
    <button
      className="text-xs text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
      onClick={openMemoryScreen}
      title={t('memoryScreen.badgeHint')}
      type="button"
    >
      {t('memoryScreen.badge')}
    </button>
  )
}

export function registerMemoryScreen(): void {
  registry.register({
    id: 'aec-memory',
    area: STATUSBAR_AREAS.left,
    source: 'core',
    order: -93,
    render: () => <MemoryBadge />
  })

  registry.register({
    id: 'aec-memory-page',
    area: ROUTES_AREA,
    source: 'core',
    // Свойство, а не значение — регистрация идёт до выбора языка (D-103).
    get title() {
      return t('memoryScreen.title')
    },
    data: { path: MEMORY_PAGE } satisfies RouteContribution,
    render: () => <MemoryPage />
  })

  registry.register({
    id: 'aec-memory-open',
    area: PALETTE_AREA,
    source: 'core',
    data: {
      id: 'aec.memory.open',
      get label() {
        return t('memoryScreen.pageCommand')
      },
      keywords: ['memory', 'facts', 'notes', 'память', 'факты', 'записка', 'запомнил'],
      run: openMemoryScreen
    } satisfies PaletteContribution
  })

  const registerNav = (): void => {
    registry.register({
      id: 'aec-memory-nav',
      area: SIDEBAR_NAV_AREA,
      source: 'core',
      order: 41,
      data: {
        codicon: 'lightbulb',
        label: t('memoryScreen.badge'),
        path: MEMORY_PAGE
      } satisfies SidebarNavContribution
    })
  }

  registerNav()
  subscribeRuntimeI18nLocale(registerNav)
}
