/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/ru_clarify.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ClarifyCopy } from './types_clarify'

export const ruClarify: Partial<ClarifyCopy> = {
  notReady: 'Запрос уточнения ещё не готов',
  gatewayDisconnected: 'Шлюз Hermes не подключён',
  sendFailed: 'Не удалось отправить ответ на уточнение',
  loadingQuestion: 'Загрузка вопроса…',
  other: 'Другое (введите ответ)',
  placeholder: 'Введите ваш ответ…',
  skip: 'Пропустить',
  skipped: 'Пропущено',
  noAnswer: 'Нет ответа',
  confirmAndContinueLabel: 'Подтвердить и продолжить',
  singleSelectHint: 'Выберите один',
  multiSelectHint: 'Выберите все подходящие',
  oneQuestion: '1 вопрос',
  questionProgress: (answered, total) => `Ответ дан на ${answered} из ${total}`,
  notDelivered:
    'Этот вопрос не дошёл до приложения, поэтому ответить здесь нельзя. Нажмите «Стоп», чтобы завершить ход, и ответьте в чате.'
}
