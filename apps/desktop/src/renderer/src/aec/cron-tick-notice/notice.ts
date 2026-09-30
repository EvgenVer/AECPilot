// Момент, когда человек заводит задачу по расписанию (задачи 3.6 и 3.6а).
//
// ИСТОРИЯ ЭТОГО ФАЙЛА В ДВУХ АБЗАЦАХ. Пока своего запуска не было, здесь стояло
// предупреждение: экран показывает задачу как `scheduled` и время следующего
// запуска, которое никогда не наступит, — и не сказать об этом значило соврать
// по умолчанию.
//
// Теперь запуск есть (задача 3.6а: их планировщик в отдельном процессе, который
// поднимается по решению человека), поэтому предупреждение превратилось в
// ПРЕДЛОЖЕНИЕ. Момент тот же и выбран по той же причине: ложное ожидание
// складывается не при открытии экрана, а при создании или включении задачи.
//
// Три состояния, три разных ответа:
//   запуск включён   — молчим: обещание выполняется, говорить не о чем;
//   выключен         — предлагаем включить, кнопкой прямо в уведомлении;
//   включён, но мёртв — говорим об этом: «включено» и «работает» не одно и то
//                       же, а задача, которая не идёт из-за упавшего процесса,
//                       выглядит точно так же, как задача, которую не завели.

import { translatePlugin } from '../../donor/i18n/plugin-i18n'
import { getRuntimeI18nLocale } from '../../donor/i18n/runtime'
import { notify } from '../../donor/store/notifications'
import { AEC_I18N_NAMESPACE } from '../../shared/i18n/aec-catalog'

import { $cronRunner, setCronRunner } from '../cron-runner/store'

import type { CronWriteKind } from './cron-tick-notice-pure'

/** Их нереактивный переводчик: перехват живёт в шиме, вне React. */
function t(key: string): string {
  return translatePlugin(AEC_I18N_NAMESPACE, getRuntimeI18nLocale(), key, [])
}

/** Один раз за жизнь окна. Человек, заводящий пять задач подряд, не должен
 * получить пять одинаковых плашек. */
let shown = false

/** Показывает предложение или предупреждение, если вызов заводит или включает
 * расписание. Возвращает true, если что-то показал. */
export function noticeCronHasNoTick(kind: CronWriteKind | null): boolean {
  if (shown) return false
  if (!kind) return false

  const state = $cronRunner.get()

  // Всё в порядке — задача действительно сработает.
  if (state.enabled && state.running) return false

  shown = true

  if (state.enabled) {
    // Включено, но процесса нет. Это не предложение, это поломка.
    notify({
      kind: 'error',
      title: t('cron.runner.brokenTitle'),
      message: t('cron.runner.brokenBody')
    })
    return true
  }

  notify({
    kind: 'warning',
    title: t('cron.noTickTitle'),
    message: t('cron.noTickBody'),
    action: {
      label: t('cron.runner.enable'),
      onClick: () => void setCronRunner(true)
    }
  })
  return true
}

let botChatShown = false

/** Подсказка D-163: где и когда виден результат рутины специалиста. Один раз
 * за жизнь окна, как и предложение выше. */
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
  shown = false
  botChatShown = false
}
