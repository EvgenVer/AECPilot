/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_clarify.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** The clarify question card. */
export interface ClarifyCopy {
  notReady: string
  gatewayDisconnected: string
  sendFailed: string
  loadingQuestion: string
  other: string
  placeholder: string
  skip: string
  skipped: string
  noAnswer: string
  confirmAndContinueLabel: string
  singleSelectHint: string
  multiSelectHint: string
  oneQuestion: string
  questionProgress: (answered: number, total: number) => string
  notDelivered: string
}
