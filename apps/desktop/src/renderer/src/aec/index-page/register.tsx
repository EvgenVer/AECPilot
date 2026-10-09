// Где человек находит страницу «Индекс» (задачи 3H.8–3H.10, SPEC UR43).
//
// ТРИ ВХОДА, И НИ ОДИН НЕ ЗАВИСИТ ОТ СТРОКИ СОСТОЯНИЯ: строка боковой панели
// (без `tier` — видна и в простом режиме), строка Ctrl+K и пункт «Настроек».
// Значок в строке состояния остаётся четвёртым, пока она видна.
//
// Строка боковой панели несёт ход индексации («Индекс · 4/12»): прогон идёт
// минутами, и человек должен видеть, что он идёт, не открывая страницу. Их
// боковая панель читает подпись при перестройке области, поэтому строка
// перерегистрируется на каждое изменение хода и языка — тот же приём, что у их
// плагина канбана со сменой языка.

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
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'
import type { GraphAddState, IngestState } from '../../../../shared/ipc'
import { INDEX_PAGE, openIndexPage } from '../workspace-pages'

import IndexPage from './IndexPage'

const t = (key: string, ...args: unknown[]): string =>
  translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)

export function registerIndexPage(): void {
  registry.register({
    id: 'aec-index-page',
    area: ROUTES_AREA,
    source: 'core',
    // Свойство, а не значение — регистрация идёт до выбора языка (D-103).
    get title() {
      return t('index.title')
    },
    data: { path: INDEX_PAGE } satisfies RouteContribution,
    render: () => <IndexPage />
  })

  registry.register({
    id: 'aec-index-open',
    area: PALETTE_AREA,
    source: 'core',
    data: {
      id: 'aec.index.open',
      get label() {
        return t('index.pageCommand')
      },
      keywords: ['index', 'rag', 'ingest', 'graph', 'индекс', 'индексация', 'граф', 'документы'],
      run: openIndexPage
    } satisfies PaletteContribution
  })

  let ingest: IngestState | null = null
  let graph: GraphAddState | null = null
  const registerNav = (): void => {
    const progress = ingest?.running ? ingest.progress : null
    // Задача 3J.11: прогон остановился или файлы не прочитались — видно из
    // боковой панели, не открывая страницу.
    const problem = !progress && hasRunProblem(ingest, graph)
    registry.register({
      id: 'aec-index-nav',
      area: SIDEBAR_NAV_AREA,
      source: 'core',
      order: 40,
      data: {
        codicon: problem ? 'warning' : 'database',
        label: progress
          ? `${t('index.title')} · ${progress.done}/${progress.total}`
          : problem
            ? `${t('index.title')} · ${t('index.navProblem')}`
            : t('index.title'),
        path: INDEX_PAGE
      } satisfies SidebarNavContribution
    })
  }

  registerNav()
  subscribeRuntimeI18nLocale(registerNav)
  void window.aecpilot.getIngestState().then((state) => {
    ingest = state
    registerNav()
  })
  window.aecpilot.onIngestState((state) => {
    ingest = state
    registerNav()
  })
  void window.aecpilot.getGraphAddState().then((state) => {
    graph = state
    registerNav()
  })
  window.aecpilot.onGraphAddState((state) => {
    graph = state
    registerNav()
  })
}

/** The last run of either kind ended without its report, or left files failed. */
export function hasRunProblem(ingest: IngestState | null, graph: GraphAddState | null): boolean {
  if (ingest && !ingest.running) {
    if (ingest.failure || ingest.error) return true
    if ((ingest.lastReport?.files_failed ?? 0) > 0) return true
  }
  if (graph && !graph.running) {
    if (graph.failure || graph.error) return true
    if ((graph.lastReport?.failed ?? 0) > 0) return true
  }
  return false
}
