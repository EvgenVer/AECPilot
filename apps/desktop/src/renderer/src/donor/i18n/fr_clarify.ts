/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/fr_clarify.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { ClarifyCopy } from './types_clarify'

export const frClarify: Partial<ClarifyCopy> = {
  notReady: "La demande de clarification n'est pas encore prête",
  gatewayDisconnected: "La Gateway Hermes n'est pas connectée",
  sendFailed: "Impossible d'envoyer la réponse de clarification",
  loadingQuestion: 'Chargement de la question…',
  other: 'Autre (saisissez votre réponse)',
  placeholder: 'Saisissez votre réponse…',
  skip: 'Passer',
  skipped: 'Ignoré',
  noAnswer: 'Pas de réponse',
  confirmAndContinueLabel: 'Confirmer et continuer',
  singleSelectHint: 'Choisir une réponse',
  multiSelectHint: 'Choisir toutes les réponses qui s’appliquent',
  oneQuestion: '1 question',
  questionProgress: (answered, total) => `${answered} réponse${answered === 1 ? '' : 's'} sur ${total}`,
  notDelivered:
    "Cette question n'a pas atteint l'app, elle ne peut donc pas être répondue ici. Appuyez sur Arrêter pour terminer le tour, puis répondez dans le chat."
}
