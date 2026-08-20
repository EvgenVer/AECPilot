// Провод к предупреждению «расписание само не сработает» (задача 3.6, O6).
// Решение о том, какой вызов его заслуживает, живёт в `cron-tick-notice-pure.ts`
// и проверено тестами; здесь — только показ.

import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { cronWriteKind, type CronWriteRequest } from './cron-tick-notice-pure'

/** Их нереактивный переводчик: перехват живёт в шиме, вне React. */
function t(key: string): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, [])
}

/** Один раз за жизнь окна. Предупреждение обязано быть заметным, но человек,
 * заводящий пять задач подряд, не должен получить пять одинаковых плашек. */
let shown = false

/** Показывает предупреждение, если этот вызов заводит или включает расписание.
 * Возвращает true, если показал, — для тестов и для будущего снятия: когда
 * свой тик появится, отсюда уйдёт вызов, а не разъедется логика. */
export function noticeCronHasNoTick(request: CronWriteRequest): boolean {
  if (shown) return false
  if (!cronWriteKind(request)) return false

  shown = true
  // `warning` у них висит до закрытия рукой, а не тает — здесь это и нужно:
  // человек только что построил ожидание, которое не сбудется.
  notify({
    kind: 'warning',
    title: t('cron.noTickTitle'),
    message: t('cron.noTickBody')
  })
  return true
}

/** Тестовый крючок: сбрасывает «уже показано». */
export function resetCronTickNotice(): void {
  shown = false
}
