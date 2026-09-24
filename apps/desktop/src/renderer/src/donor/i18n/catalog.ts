/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/catalog.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
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
import type { Locale, Translations } from './types'
import { zh } from './zh'
import { zhHant } from './zh-hant'

export const TRANSLATIONS: Record<Locale, Translations> = {
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
