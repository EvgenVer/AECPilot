/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/memory-status.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Bumped whenever something that changes `GET /api/memory`'s answer lands
 *  (config autosave, provider credential save, OAuth completion), so the
 *  Memory summary refetches instead of showing the pre-change readiness. */
export const $memoryStatusRevision = atom(0)

export function refreshMemoryStatus(): void {
  $memoryStatusRevision.set($memoryStatusRevision.get() + 1)
}
