/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_notices.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { TranslationOverrides } from './define-locale'

// Shell notices (remote-display toast, butterbar, keep-awake offer), spread into de.ts.
export const deNotices = {
  remoteDisplayBanner: {
    message: reason =>
      `Software-Rendering aktiv — Remote-Display erkannt (${reason}). GPU-Beschleunigung ist deaktiviert, um Flackern zu verhindern.`
  },
  butterbar: {
    goTo: (index, total) => `Hinweis ${index} von ${total} anzeigen`,
    legal: {
      before: 'Die Nutzung von Hermes Agent unterliegt unseren ',
      terms: 'Nutzungsbedingungen',
      between: ' und unserer ',
      privacy: 'Datenschutzerklärung',
      after: '.'
    }
  },
  keepAwakeOffer: {
    title: 'Ihr Computer ist eingeschlafen, während Hermes gearbeitet hat',
    message:
      'Hermes kann den Computer wach halten, solange eine Aufgabe läuft. Der Bildschirm schaltet sich weiterhin aus, und im Akkubetrieb kann der Computer trotzdem einschlafen.',
    action: 'Während der Arbeit wach halten'
  }
} satisfies Pick<TranslationOverrides, 'remoteDisplayBanner' | 'butterbar' | 'keepAwakeOffer'>
