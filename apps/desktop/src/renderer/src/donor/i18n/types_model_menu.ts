/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/types_model_menu.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
export interface ModelMenuTranslations {
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
