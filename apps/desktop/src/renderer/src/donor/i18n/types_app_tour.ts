/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_app_tour.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
interface TourStopCopy {
  title: string
  text: string
}

/** The app's own tour, run when `gui_tour` starts with no steps. */
export interface AppTourTranslations {
  sessions: TourStopCopy
  composer: TourStopCopy
  newSession: TourStopCopy
  model: TourStopCopy
  /** Appended to the model stop when this computer can run a local model. */
  modelLocal: string
  capabilities: TourStopCopy
  messaging: TourStopCopy
  rightPane: TourStopCopy
}
