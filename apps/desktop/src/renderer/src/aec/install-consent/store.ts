// Отложенный вопрос «ставим?» (задача 3.8, SPEC UR23).
//
// Хранилище, а не состояние компонента, по той же причине, что у согласия на
// внешний канал: вопрос задаётся из нашего моста — обычного модуля, над которым
// нет React, — а отвечает на него диалог, смонтированный один раз у корня.
//
// По одному за раз. Второй вопрос, пришедший поверх открытого, ОТКЛОНЯЕТСЯ, а
// не заменяет видимый: подмена вопроса под курсором — это способ получить «да»
// на то, о чём человека не спрашивали.

import { atom } from 'nanostores'

import type { InstallRequest } from './install-consent-pure'

export interface InstallConsentQuestion extends InstallRequest {
  answer: (allowed: boolean) => void
}

export const $installConsent = atom<InstallConsentQuestion | null>(null)

export function askInstallConsent(request: InstallRequest): Promise<boolean> {
  if ($installConsent.get()) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    $installConsent.set({
      ...request,
      answer: (allowed) => {
        $installConsent.set(null)
        resolve(allowed)
      }
    })
  })
}
