// Где человек видит и меняет проект в любом режиме (задача 3H.28, D-191,
// решение владельца 2026-10-08): маршрут страницы «Проект» и строка боковой
// панели «Проект: <имя>» без `tier` — она видна и в простом режиме, где строки
// состояния с меню проекта нет. Меню в строке состояния остаётся как было.
//
// Подпись строки их панель читает при перестройке области, поэтому смена языка
// и смена проекта перерегистрируют строку — тот же приём, что у «Памяти · N».

import {
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  type RouteContribution,
  type SidebarNavContribution
} from '../../donor/app/routes'
import { registry } from '../../donor/contrib/registry'
import { getRuntimeI18nLocale, subscribeRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'
import { PROJECT_PAGE } from '../workspace-pages'

import ProjectPage from './ProjectPage'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

export function registerProjectPage(): void {
  registry.register({
    id: 'aec-project-page',
    area: ROUTES_AREA,
    source: 'core',
    // Свойство, а не значение — регистрация идёт до выбора языка (D-103).
    get title() {
      return t('project.pageTitle')
    },
    data: { path: PROJECT_PAGE } satisfies RouteContribution,
    render: () => <ProjectPage />
  })

  let name: string | null = null
  const registerNav = (): void => {
    registry.register({
      id: 'aec-project-nav',
      area: SIDEBAR_NAV_AREA,
      source: 'core',
      order: 39,
      data: {
        codicon: 'folder',
        label: name === null ? t('project.none') : t('project.navLabel', name),
        path: PROJECT_PAGE
      } satisfies SidebarNavContribution
    })
  }

  registerNav()
  subscribeRuntimeI18nLocale(registerNav)
  void window.aecpilot.getCurrentProject().then((project) => {
    name = project?.name ?? null
    registerNav()
  })
  window.aecpilot.onProjectOpened((project) => {
    name = project.name
    registerNav()
  })
}
