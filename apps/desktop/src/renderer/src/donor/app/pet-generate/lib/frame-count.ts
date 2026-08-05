/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/pet-generate/lib/frame-count.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { type PetInfo } from '@/store/pet'

// Sprite row → the PetInfo frame-count key it resolves to (directional walks and
// aliases collapse onto their base state).
const ROW_TO_FRAME_KEY: Record<string, string> = {
  idle: 'idle',
  wave: 'wave',
  waving: 'wave',
  jump: 'jump',
  jumping: 'jump',
  run: 'run',
  running: 'run',
  'running-right': 'run',
  'running-left': 'run',
  failed: 'failed',
  review: 'review',
  waiting: 'waiting'
}

// Real frame count for a row, preferring the concrete per-row count, then the
// per-state count, then the mapped base state, then the sheet-wide default.
export function frameCountForRow(pet: PetInfo, row: string): number {
  const mapped = ROW_TO_FRAME_KEY[row]

  return (
    pet.framesByRow?.[row] ??
    pet.framesByState?.[row] ??
    (mapped ? pet.framesByState?.[mapped] : undefined) ??
    pet.framesPerState ??
    0
  )
}
