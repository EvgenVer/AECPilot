// Подсказка, где появится результат рутины специалиста (D-163, решение владельца
// 2026-09-30).
//
// До T53.3 здесь жило и предложение «включить расписания»: наш тик был отдельным
// процессом, который человек поднимал сам. С единым шлюзом (решение 0017) рутины
// запускает планировщик ядра, пока открыто окно, — включать нечего, и предложение
// удалено вместе с выключателем.

import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

/** Их нереактивный переводчик: перехват живёт в мосту, вне React. */
function t(key: string): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, [])
}

let botChatShown = false

/** Результат рутины специалиста ядро доставляет в его чат, но в уже открытое окно
 * чата — только после хода в нём. Один раз за жизнь окна. */
export function noticeBotChatResult(): void {
  if (botChatShown) return
  botChatShown = true
  notify({
    kind: 'info',
    title: t('cron.botChatTitle'),
    message: t('cron.botChatBody')
  })
}

/** Тестовый крючок: сбрасывает «уже показано». */
export function resetCronTickNotice(): void {
  botChatShown = false
}
