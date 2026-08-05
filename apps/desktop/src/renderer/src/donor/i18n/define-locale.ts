/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/define-locale.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { en } from './en'
import type { Translations } from './types'

type TranslationOverride<T> = T extends (...args: never[]) => string
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends string
      ? string
      : T extends object
        ? { [K in keyof T]?: TranslationOverride<T[K]> }
        : T

export type TranslationOverrides = TranslationOverride<Translations>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeTranslations<T>(base: T, overrides: TranslationOverride<T> | undefined): T {
  if (!isRecord(base) || !isRecord(overrides)) {
    return (overrides ?? base) as T
  }

  const result: Record<string, unknown> = { ...base }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue
    }

    const baseValue = result[key]
    result[key] = isRecord(baseValue) && isRecord(value) ? mergeTranslations(baseValue, value) : value
  }

  return result as T
}

export function defineLocale(overrides: TranslationOverrides): Translations {
  return mergeTranslations<Translations>(en, overrides)
}
