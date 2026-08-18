// Подписка на два сообщения ядра, которые до этого не доходили ни до кого
// (задачи 4D-1 и 4D-2). Решение о том, что с событием делать, живёт в
// `core-notices-pure.ts` и проверено тестами; здесь — только провод.

import { gatewayBridge } from '../../shared/gateway-bridge'
import { notify } from '../../donor/store/notifications'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'
import type { GatewayEvent } from '../../../../shared/gateway/types'

import { coreNoticeAction } from './core-notices-pure'

/** Их нереактивный переводчик — тот же, которым берутся заголовки панелей:
 * подписка живёт вне React и хука вызвать не может. */
function t(key: string, ...args: unknown[]): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)
}

function handle(event: GatewayEvent): void {
  const action = coreNoticeAction(event)
  if (!action) return

  if (action.kind === 'log') {
    // Намеренно только в лог. Это деградация побочного пути — человеку не
    // решать и не исправлять, а вот при разборе «почему агент повёл себя
    // странно» строка нужна.
    console.warn('[hermes warn]', action.text)
    return
  }

  if (action.kind === 'toast') {
    // Текст пишет ядро: «превышено число повторов», «кончились кредиты». Это
    // объяснение, почему работа встала. `warning` у них по умолчанию висит до
    // закрытия рукой (`defaultDuration`), а не тает через несколько секунд —
    // именно то, что здесь нужно.
    notify({ kind: 'warning', message: action.text })
    return
  }

  notify({
    kind: 'warning',
    title: t('coreNotice.riskTitle'),
    message: t('coreNotice.riskBody', action.tool)
  })
}

/** Подписывается один раз на всё время жизни окна. */
export function registerCoreNotices(): () => void {
  return gatewayBridge().onEvent(handle as (event: unknown) => void)
}
