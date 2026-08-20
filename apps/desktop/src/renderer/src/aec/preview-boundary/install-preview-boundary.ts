// Исполнение границы предпросмотра (задача 3.4, SPEC HX13). Решение — в
// `preview-boundary-pure.ts`, здесь только надзор за списком вкладок и отказ.
//
// Почему надзор, а не запрет на входе: `openPreview` вендорная, а список
// вкладок — атом, на который можно подписаться из нашей зоны. Вкладка с
// внешним адресом снимается в том же такте, в котором появилась (nanostores
// зовёт подписчиков синхронно после `set`), поэтому панель с ней не успевает
// смонтироваться, а `<webview>` в этой сборке всё равно мёртв — `webviewTag`
// в окне не включён (SPEC C9, `main/index.ts`).
//
// Отказ показывается человеку каждый раз: он на что-то нажал, и тишина в ответ
// — это ровно тот молчаливый отказ, из-за которого в этой фазе уже дважды
// чинили «кнопку, которая ничего не делает» (находка D-41).

import { $previewTabs, closeRightRailTab } from '../../donor/store/preview'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { isExternalPreview, refusedAddress } from './preview-boundary-pure'

function t(key: string, ...args: unknown[]): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)
}

/** Снимает внешние вкладки и объясняет отказ. Возвращает адреса, по которым
 * отказано, — для тестов. */
export function enforcePreviewBoundary(): string[] {
  const refused: string[] = []

  for (const tab of $previewTabs.get()) {
    if (!isExternalPreview(tab.target)) continue

    refused.push(refusedAddress(tab.target))
    closeRightRailTab(tab.id)
  }

  for (const address of refused) {
    notify({
      kind: 'warning',
      title: t('preview.externalTitle'),
      message: t('preview.externalBody', address)
    })
  }

  return refused
}

/** Ставит надзор. Зовётся из тела `main.tsx` один раз на окно; первый прогон
 * нужен ради вкладки, восстановленной из хранилища прошлого запуска. */
export function installPreviewBoundary(): () => void {
  enforcePreviewBoundary()
  return $previewTabs.listen(() => {
    enforcePreviewBoundary()
  })
}
