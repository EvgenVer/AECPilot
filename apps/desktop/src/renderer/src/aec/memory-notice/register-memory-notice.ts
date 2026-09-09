// Задача 5.1б. Провод к сообщению о выключенном втором слое памяти. Решения —
// в `memory-notice-pure.ts` и под тестами; здесь только подключение.
//
// ОДНО СООБЩЕНИЕ НА ОКНО, а не на ход. Причина не в экономии: слой не поднялся
// один раз и остаётся не поднятым, а повторяющееся предупреждение о том, что
// человек уже знает и сейчас исправить не может, приучает закрывать не читая —
// и вместе с ним закроют то, что важно.

import { gatewayBridge } from '../../shared/gateway-bridge'
import { notify } from '../../donor/store/notifications'
import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'
import type { GatewayEvent } from '../../../../shared/gateway/types'

import { memoryLayerVerdict, memoryToolFailure } from './memory-notice-pure'

function t(key: string, ...args: unknown[]): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)
}

let told = false

function tell(message: string): void {
  if (told) return
  told = true
  // `warning` у них висит до закрытия рукой, а не тает: сообщение о том, что
  // разговор не запоминается, человек должен успеть прочитать.
  notify({ kind: 'warning', title: t('memoryNotice.title'), message })
}

/** Спросить ядро, поднялся ли слой. Ответ приходит до первого хода — раньше,
 *  чем человек успеет что-то сказать в пустоту. */
async function askCore(): Promise<void> {
  let payload: unknown
  try {
    payload = await window.aecpilot.gatewayRest('/api/memory')
  } catch {
    // Ядро недоступно — об этом говорит связь, а не память. Своё сообщение
    // здесь было бы вторым про одно и то же.
    return
  }

  const verdict = memoryLayerVerdict(payload)
  if (verdict.kind !== 'down') return

  tell(t(`memoryNotice.${verdict.reason}`))
}

function onEvent(event: GatewayEvent): void {
  // Вторая дорога и единственная, которой приходит недоступный endpoint:
  // в статусе его не видно (замер — в шапке `memory-notice-pure.ts`).
  const failure = memoryToolFailure(event)
  if (failure) tell(t('memoryNotice.toolFailed', failure))
}

/** Подписывается один раз на всё время жизни окна. */
export function registerMemoryNotice(): () => void {
  void askCore()

  return gatewayBridge().onEvent(onEvent as (event: unknown) => void)
}
