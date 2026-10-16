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

import { openDataProviders } from '../data-providers/store'

import { memoryLayerVerdict, memoryProviderGap, memoryToolFailure } from './memory-notice-pure'

function t(key: string, ...args: unknown[]): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, args)
}

let told = false

function tell(message: string, action?: { label: string; onClick: () => void }): void {
  if (told) return
  told = true
  // `warning` у них висит до закрытия рукой, а не тает: сообщение о том, что
  // разговор не запоминается, человек должен успеть прочитать. `persistent`
  // (донор 0.22.2) — оно про окно, и смена сессии его не снимает.
  notify({ kind: 'warning', persistent: true, title: t('memoryNotice.title'), message, action })
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

  let providers: Awaited<ReturnType<typeof window.aecpilot.getDataProviders>> | null = null
  try {
    providers = await window.aecpilot.getDataProviders()
  } catch {
    // Профиль не прочитан — остаётся ответ ядра.
  }

  const verdict = memoryLayerVerdict(payload, providers?.memoryPackages ?? null)
  if (verdict.kind === 'off') return

  // Задача 3G.49: нет провайдера — причина конкретнее любого ответа ядра, и у неё
  // есть действие: окно выбора.
  if (providers) {
    const gap = memoryProviderGap(providers)
    if (gap !== null) {
      tell(t('memoryNotice.provider', gap), {
        label: t('memoryNotice.choose'),
        onClick: openDataProviders
      })
      return
    }
  }

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
