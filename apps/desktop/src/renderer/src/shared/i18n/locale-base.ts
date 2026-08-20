// Основа для наших частичных каталогов (требование владельца 2026-08-20).
//
// У донора для этого есть `defineLocale`, но он сливает переводы поверх ИХ
// английского каталога — то есть непереведённый ключ вернул бы строку с их
// именем продукта. Здесь то же самое, только основа наша: их строки, прогнанные
// через `debrand.ts`.

import type { TranslationOverrides } from '../../donor/i18n/define-locale'
import type { Translations } from '../../donor/i18n/types'

import { debrandTranslations, mergeOver } from './debrand'
import { en } from './en'

export type { TranslationOverrides }

/** Частичный каталог поверх нашего английского. */
export function debrandedEnBase(overrides: TranslationOverrides): Translations {
  // Переводы тоже проходят через замену: строка, где кто-то однажды напишет их
  // имя, не должна проехать мимо только потому, что она наша.
  return mergeOver(en, debrandTranslations(overrides))
}
