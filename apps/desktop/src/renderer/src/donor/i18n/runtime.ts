/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/i18n/runtime.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { TRANSLATIONS } from './catalog'
import { DEFAULT_LOCALE } from './languages'
import type { Locale } from './types'

let runtimeLocale: Locale = DEFAULT_LOCALE

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Walk a dot-path (`a.b.c`) into a nested message tree. */
function resolvePath(source: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), source)
}

/** A string is returned as-is, a function is called with `args`, else `null`. */
function render(value: unknown, args: unknown[]): null | string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'function') {
    return (value as (...args: unknown[]) => string)(...args)
  }

  return null
}

/** The active → DEFAULT → key resolution every translator shares. `source`
 *  yields a message tree per locale — the app catalog, or a plugin's bundles. */
export function translateFrom(
  source: (locale: Locale) => unknown,
  locale: Locale,
  key: string,
  args: unknown[]
): string {
  const active = render(resolvePath(source(locale), key), args)

  if (active !== null) {
    return active
  }

  if (locale !== DEFAULT_LOCALE) {
    const fallback = render(resolvePath(source(DEFAULT_LOCALE), key), args)

    if (fallback !== null) {
      return fallback
    }
  }

  return key
}

export function setRuntimeI18nLocale(locale: Locale) {
  runtimeLocale = locale
}

/** The locale module-level translators resolve against (the app's active
 *  `display.language`). Plugin `ctx.i18n.t` reads this too. */
export function getRuntimeI18nLocale(): Locale {
  return runtimeLocale
}

export function translateNow(key: string, ...args: unknown[]): string {
  return translateFrom(locale => TRANSLATIONS[locale], runtimeLocale, key, args)
}
