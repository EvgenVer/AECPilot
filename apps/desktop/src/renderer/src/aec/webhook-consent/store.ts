// Отложенный вопрос «перезапустить ядро ради вебхуков?» (задача 3F.D4, D-105).
//
// Хранилище по той же причине, что у согласия на канал: вопрос задаётся из
// моста, а отвечает диалог у корня. Второй вопрос поверх открытого отклоняется.

import { atom } from 'nanostores'

export interface WebhookConsentQuestion {
  answer: (allowed: boolean) => void
}

export const $webhookConsent = atom<WebhookConsentQuestion | null>(null)

export function askWebhookConsent(): Promise<boolean> {
  if ($webhookConsent.get()) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    $webhookConsent.set({
      answer: (allowed) => {
        $webhookConsent.set(null)
        resolve(allowed)
      }
    })
  })
}
