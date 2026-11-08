/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ru_cron_control.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { CronControlCopy } from './types_cron_control'

export const ruCronControl: CronControlCopy = {
  stop: 'Остановить',
  stopping: 'Остановка…',
  stopped: 'Запуск отменён',
  finishedFirst: 'Запуск завершился до остановки',
  nothingToStop: 'Нет активного запуска',
  failedStop: 'Не удалось остановить запуск',
  lastCancelled: (reason: string) => (reason ? `Последний запуск отменён: ${reason}` : 'Последний запуск отменён'),
  catchUpLabel: 'Пропущенные запуски',
  catchUpHint: 'Что делать с запусками, пропущенными, пока Hermes не работал.',
  catchUpChoices: {
    default: 'По умолчанию',
    run: 'Запустить один раз после возврата',
    skip: 'Пропустить'
  }
}
