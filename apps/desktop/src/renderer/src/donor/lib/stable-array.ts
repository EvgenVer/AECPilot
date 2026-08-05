/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/stable-array.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/** Keep `prev`'s reference when it's element-equal to `next`, so a nanostores
 *  `computed` (notifies on `!==`) skips the emit when its projected list didn't
 *  actually change — e.g. status-id sets recomputed on every stream delta.
 *  `next` is frozen: the ref is shared across ticks, so an in-place mutation
 *  would corrupt the cache — fail loud instead. */
export const stableArray = <T>(prev: readonly T[], next: T[]): readonly T[] =>
  prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : Object.freeze(next)
