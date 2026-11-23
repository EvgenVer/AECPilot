/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_model_menu.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface ModelMenuTranslations {
  /** A pick made while a turn runs: the owner records it for the next turn. */
  pickDeferred: (model: string) => string
  search: string
  noModels: string
  editModels: string
  followDefault: string
  refreshModels: string
  favorites: string
  addFavorite: string
  removeFavorite: string
  favoriteShortcut: string
  fast: string
  free: string
  cacheRead: string
  priceTitle: (input: string, output: string, cache: string) => string
  localSetup: { title: string; text: (model: string, size: string) => string; action: string }
  limited: string
  limitedUntil: (time: string) => string
  limitedTip: (provider: string, time: null | string) => string
  modelResets: (time: string) => string
  modelLimitedTip: (time: string) => string
  usageLeft: (percent: number, time: null | string) => string
  poolAccounts: (count: number) => string
  poolLimited: (limited: number, total: number) => string
  poolAccount: (number: number) => string
  poolUnknown: string
  poolUnavailable: string
  usageTip: (provider: string) => string
  usageWindow: (label: string, percent: number, time: null | string) => string
}
