/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/catalog.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
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
  ru
}
