/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/memory-status.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
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
