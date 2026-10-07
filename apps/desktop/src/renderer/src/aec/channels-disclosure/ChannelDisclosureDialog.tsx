// The list a person sees before an external channel opens (task 3.10, AC10/R10).
//
// Ours, not theirs: their screen enables on the switch, because in their product
// whoever flips it already knows what a bot bridge does. Here the switch may be
// flipped by an engineer whose vault holds a client's project documents, and
// "the agent can now be started by anyone who can write to that chat" is not
// something to learn afterwards.
//
// Mounted once at the root and driven by a store, because the question comes
// from our bridge (`shared/hermes-desktop-shim`) rather than from a component.

import { useStore } from '@nanostores/react'

import { Button } from '../../donor/components/ui/button'
import { useAecT } from '../../shared/i18n'

import { CHANNEL_DISCLOSURE_ITEMS, extraDisclosureItems } from './disclosure-pure'
import { $channelConsent } from './store'

export default function ChannelDisclosureDialog(): React.JSX.Element | null {
  const request = useStore($channelConsent)
  const t = useAecT()

  if (!request) return null

  const title = t('channels.disclosure.title', request.platformName)

  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => request.answer(false)}
    >
      <div
        aria-label={title}
        aria-modal="true"
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-(--stroke-nous) bg-(--ui-chat-bubble-background) p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="text-sm font-semibold text-(--ui-text-primary)">{title}</h2>

        <p className="text-xs text-(--ui-text-secondary)">{t('channels.disclosure.lead')}</p>

        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs text-(--ui-text-secondary)">
          {[...CHANNEL_DISCLOSURE_ITEMS, ...extraDisclosureItems(request.platformId)].map(
            (item) => (
              <li key={item}>{t(item)}</li>
            )
          )}
        </ul>

        <p className="text-xs text-(--ui-text-secondary)">{t('channels.disclosure.reversible')}</p>

        <div className="flex justify-end gap-2">
          <Button onClick={() => request.answer(false)} size="sm" variant="ghost">
            {t('common.cancel')}
          </Button>
          <Button onClick={() => request.answer(true)} size="sm">
            {t('channels.disclosure.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
