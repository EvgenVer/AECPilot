/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/path-compare.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Comparing two paths for identity or containment, across host spellings.
 *
 *  A cwd reaches us from the backend, a picker, a session row and a project
 *  record, and the four don't agree on separator, trailing slash or drive-letter
 *  case. Compare through these rather than `===` / `startsWith`.
 */

/** Windows drive (`C:\\`, `C:/`) or UNC (`\\\\server\\share`) absolute path.
 *  Such a path never gets joined onto a cwd. */
export const isWindowsAbsolutePath = (path: string): boolean => /^(?:[A-Za-z]:[\\/]|\\\\)/.test(path)

/** POSIX-style spelling: one separator, no trailing slash. */
export const cleanPath = (path: string): string => path.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '/'

/** Case-folded comparison key. Windows drive/UNC paths are case-insensitive;
 *  POSIX paths are not, and callers that display a path want its real spelling,
 *  so fold only the key. Expects an already-`cleanPath`ed value. */
export const comparisonPath = (path: string): string =>
  /^[A-Za-z]:(?:\/|$)/.test(path) || path.startsWith('//') ? path.toLowerCase() : path

/** True when `child` IS `parent` or lives underneath it. */
export const isUnderPath = (parent: string, child: string): boolean => {
  const p = comparisonPath(cleanPath(parent))
  const c = comparisonPath(cleanPath(child))

  return c === p || c.startsWith(`${p}/`)
}
