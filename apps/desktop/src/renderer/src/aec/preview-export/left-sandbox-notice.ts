// Задача 3E.26 (SPEC UR22). Момент, когда содержимое предпросмотра покидает
// песочницу.
//
// ПОЧЕМУ ЭТО ВООБЩЕ ГОВОРИТСЯ ЧЕЛОВЕКУ. UR22 обещает: предпросмотр — в
// песочнице. Кнопка «открыть в браузере» на ветке с выгрузкой это обещание
// нарушает по явному нажатию: HTML, произведённый агентом, записывается файлом
// и исполняется в настоящем браузере с правами локального файла. Владелец
// принял эту цену прямым решением 2026-09-08 и там же сказал, что она не должна
// быть спрятана в коде. Плашка — то место, где «не спрятана» видно человеку в
// ту же секунду.
//
// ГОВОРИТСЯ НЕ ВСЕГДА: только когда файл выгружали МЫ (`staged`). Открытие
// страницы проекта или сетевого адреса ничего наружу не выносит, и плашка там
// была бы шумом, от которого перестают читать нужные.

import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

function t(key: string): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, [])
}

/** Показывает, что содержимое вкладки ушло за границу песочницы. */
export function noticePreviewLeftSandbox(): void {
  notify({
    // Постоянный id: два нажатия подряд дают одну плашку, а не стопку. Их
    // `notify` по совпадающему id обновляет прежнюю.
    id: 'aec-preview-left-sandbox',
    kind: 'warning',
    title: t('preview.leftSandboxTitle'),
    message: t('preview.leftSandboxMessage')
  })
}
