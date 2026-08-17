// The pending "you are about to open this channel" question (task 3.10).
//
// A store rather than component state because the question is asked from our
// bridge — a plain module with no React above it — and answered by a dialog
// mounted once at the root. One at a time: their screen disables the switch
// while a save is in flight, and two overlapping questions would be a UI that
// cannot say which channel it is asking about.

import { atom } from 'nanostores'

export interface ChannelConsentRequest {
  platformId: string
  answer: (allowed: boolean) => void
}

export const $channelConsent = atom<ChannelConsentRequest | null>(null)

/** Resolves true when the person accepts what the list says, false when they
 * back out — including when a second request arrives while one is open, which
 * cancels the newcomer rather than replacing the visible question. */
export function askChannelConsent(platformId: string): Promise<boolean> {
  if ($channelConsent.get()) return Promise.resolve(false)

  return new Promise<boolean>((resolve) => {
    $channelConsent.set({
      platformId,
      answer: (allowed) => {
        $channelConsent.set(null)
        resolve(allowed)
      }
    })
  })
}
