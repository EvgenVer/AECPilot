/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/de_clarify.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ClarifyCopy } from './types_clarify'

export const deClarify: Partial<ClarifyCopy> = {
  notReady: 'Klärungsanfrage ist noch nicht bereit',
  gatewayDisconnected: 'Hermes-Gateway ist nicht verbunden',
  sendFailed: 'Klärungsantwort konnte nicht gesendet werden',
  loadingQuestion: 'Frage wird geladen…',
  other: 'Anderes (Antwort eingeben)',
  placeholder: 'Geben Sie Ihre Antwort ein…',
  skip: 'Überspringen',
  skipped: 'Übersprungen',
  noAnswer: 'Keine Antwort',
  confirmAndContinueLabel: 'Bestätigen und fortfahren',
  singleSelectHint: 'Eines auswählen',
  multiSelectHint: 'Alle Treffer auswählen',
  oneQuestion: '1 Frage',
  questionProgress: (answered, total) => `${answered} von ${total} beantwortet`,
  notDelivered:
    'Diese Frage hat die App nicht erreicht und kann hier nicht beantwortet werden. Klicken Sie auf Stopp, um den Durchgang zu beenden, und antworten Sie dann im Chat.'
}
