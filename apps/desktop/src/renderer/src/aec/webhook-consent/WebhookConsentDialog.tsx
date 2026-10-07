// Цена включения приёмника вебхуков — до нажатия (задача 3F.D4, D-105).
//
// Их экран включает приёмник одной кнопкой, и ядро перезапускается, обрывая
// живой разговор. Вопрос задаётся из моста (`shared/hermes-desktop-shim`),
// поэтому диалог смонтирован у корня.

import { useStore } from '@nanostores/react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'
import { CloseOnEscape } from '../CloseOnEscape'

import { $webhookConsent } from './store'

export default function WebhookConsentDialog(): React.JSX.Element | null {
  const request = useStore($webhookConsent)
  const t = useAecT()

  if (!request) return null

  const title = t('webhookConsent.title')

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => request.answer(false)}
    >
      <CloseOnEscape onClose={() => request.answer(false)} />
      <div
        aria-label={title}
        aria-modal="true"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">{title}</h2>

        <p className="text-xs text-(--ui-text-secondary)">{t('webhookConsent.body')}</p>

        <div className="flex justify-end gap-2">
          <Button onClick={() => request.answer(false)} size="sm" variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button onClick={() => request.answer(true)} size="sm">
            {t('webhookConsent.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
