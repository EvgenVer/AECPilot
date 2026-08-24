// Провод к `resume-progress-pure.ts` (находка D-39). Решение — там, здесь
// только подписка и показ через их хранилище уведомлений.

import { gatewayBridge } from '../../shared/gateway-bridge'
import { dismissNotification, notify } from '../../donor/store/notifications'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { resumeNoticeAction } from './resume-progress-pure'

/** Их нереактивный переводчик — подписка живёт вне React и хука позвать не
 * может. Тот же приём, что в `register-core-notices`. */
function t(key: string, ...args: unknown[]): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)
}

/**
 * Порог, ниже которого извещение не показывается вовсе.
 *
 * ЗАМЕРЕНО на живом ядре 2026-08-24: у сессии из двух сообщений `loading` и
 * `complete` приходят подряд, в пределах одной секунды. Без порога извещение
 * мигало бы при КАЖДОМ возврате к сессии — и находка про необъяснённое пустое
 * окно была бы закрыта заведением новой помехи. Объяснение нужно там, где
 * ожидание заметно; порог отсекает всё остальное.
 *
 * Само число — решение, а не замер: четверть секунды это граница, за которой
 * человек начинает воспринимать задержку как ожидание.
 */
const VISIBLE_AFTER_MS = 250

const pending = new Map<string, ReturnType<typeof setTimeout>>()

function handle(event: unknown): void {
  const action = resumeNoticeAction(event)
  if (!action) return

  const waiting = pending.get(action.id)
  if (waiting !== undefined) {
    clearTimeout(waiting)
    pending.delete(action.id)
  }

  if (action.kind === 'hide') {
    // Снимается и то, что уже показано: если загрузка уложилась в порог,
    // показывать было нечего, а `dismissNotification` на неизвестный id —
    // безвредная пустая операция.
    dismissNotification(action.id)
    return
  }

  pending.set(
    action.id,
    setTimeout(() => {
      pending.delete(action.id)
      notify({
        id: action.id,
        kind: 'info',
        message: t('resumeProgress.loading'),
        // Само не тает: пропасть оно должно ПО СОБЫТИЮ, когда история доехала.
        // Извещение, исчезнувшее раньше окончания загрузки, вернуло бы человека
        // ровно туда, откуда его забрали, — к необъяснённому пустому окну.
        durationMs: 0
      })
    }, VISIBLE_AFTER_MS)
  )
}

/** Подписывается один раз на всё время жизни окна. */
export function registerResumeProgress(): () => void {
  const unsubscribe = gatewayBridge().onEvent(handle)

  return () => {
    unsubscribe()
    for (const timer of pending.values()) clearTimeout(timer)
    pending.clear()
  }
}
