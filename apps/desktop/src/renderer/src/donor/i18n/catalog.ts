/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/catalog.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] registration table: 'en' and 'ru' point at OUR catalogs — their strings
 *       with their product name rewritten to ours (owner decision 2026-08-20;
 *       'ru' is their own catalog since 0.21.2, debranded the same way — 3.B4в)
 * (no other edits)
 */
import { en } from '../../shared/i18n/en'
import { ru } from '../../shared/i18n/ru'

import { ar } from './ar'
import { de } from './de'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import type { BundledLocale, Translations } from './types'
import { zh } from './zh'
import { zhHant } from './zh-hant'

/** The catalogs compiled into the app. Runtime-registered languages (plugin
 *  packs, backend `.desktop.yaml` packs) are NOT here — resolve through
 *  `resolveTranslations()` in `./registry`, which layers them over these. */
export const TRANSLATIONS: Record<BundledLocale, Translations> = {
  en,
  zh,
  'zh-hant': zhHant,
  ja,
  ar,
  ru,
  fr,
  de,
  es
}

export const BUNDLED_LOCALES = Object.keys(TRANSLATIONS) as readonly BundledLocale[]

export function isBundledLocale(value: unknown): value is BundledLocale {
  return typeof value === 'string' && Object.hasOwn(TRANSLATIONS, value)
}
