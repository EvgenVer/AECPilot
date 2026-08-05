/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/catalog.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [3] registration table: added 'ru', whose catalog is ours (SPEC C7)
 * (no other edits)
 */
import { ru } from '../../shared/i18n/ru'

import { ar } from './ar'
import { en } from './en'
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
