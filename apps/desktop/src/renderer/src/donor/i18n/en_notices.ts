/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/en_notices.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { Translations } from './types'

// Shell notices (remote-display toast, butterbar, keep-awake offer), spread into en.ts.
export const enNotices = {
  remoteDisplayBanner: {
    message: reason =>
      `Software rendering active — remote display detected (${reason}). GPU acceleration is disabled to prevent flickering.`
  },
  butterbar: {
    goTo: (index, total) => `Show notice ${index} of ${total}`,
    legal: {
      before: 'Use of Hermes Agent is subject to our ',
      terms: 'Terms of Service',
      between: ' and ',
      privacy: 'Privacy Policy',
      after: '.'
    }
  },
  keepAwakeOffer: {
    title: 'Your computer slept while Hermes was working',
    message:
      'Hermes can keep your computer awake while a task runs. The screen still turns off, and on battery your computer may still sleep.',
    action: 'Keep awake while working'
  }
} satisfies Pick<Translations, 'remoteDisplayBanner' | 'butterbar' | 'keepAwakeOffer'>
