// Translator for our own strings outside React (stores, bridges, pure modules).
//
// A component takes `useAecT()`, which re-renders on a language switch. Code
// that has no component — a store's refusal text, an error thrown by the bridge,
// a label built in a pure function — asks for the string at the moment it is
// needed, in the language active right then.
//
// THIS MODULE IMPORTS NOTHING FROM THEIR i18n TREE, and that is the point, not
// tidiness. `gateway-bridge.ts` and the desktop shim are links of the chain
// their catalog is built through (`en.ts` → settings constants → … → the
// bridge). A value import from `donor/i18n/*` here closes a cycle through the
// catalog, and an `en` that is still half-built when `ru` merges over it gives a
// Russian catalog with missing sections (measured 2026-10-19: 54 of 56 top-level
// sections, `ru-coverage.test.ts` red). The active language is therefore
// injected by `./index.tsx` (`bindAecLocale`), which already imports their tree.
// Until it is bound, the product's default language is used — Russian, SPEC C7.

import { aecLocales } from './aec-catalog'

const DEFAULT_LOCALE = 'ru'
const FALLBACK_LOCALE = 'en'

let activeLocale: () => string = () => DEFAULT_LOCALE

/** Called once by `./index.tsx` with their runtime-locale getter. */
export function bindAecLocale(getter: () => string): void {
  activeLocale = getter
}

function resolve(tree: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      tree
    )
}

function render(value: unknown, args: unknown[]): null | string {
  if (typeof value === 'string') return value
  if (typeof value === 'function') return (value as (...a: unknown[]) => string)(...args)
  return null
}

/** `key` in `locale`, else in English, else the key itself — the same chain
 * their plugin translator walks. */
export function translateAec(locale: string, key: string, ...args: unknown[]): string {
  const bundles = aecLocales as Record<string, unknown>
  return (
    render(resolve(bundles[locale], key), args) ??
    render(resolve(bundles[FALLBACK_LOCALE], key), args) ??
    key
  )
}

export function aecT(key: string, ...args: unknown[]): string {
  return translateAec(activeLocale(), key, ...args)
}
