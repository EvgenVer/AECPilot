/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/voice-stream-paint.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

// Voice replies still consume the frame-published transcript. This is streaming
// demand only: enabling voice must not disable normal idle-window throttling.
export const $voiceStreamPaintOwners = atom(0)

export function retainVoiceStreamPaint(): () => void {
  $voiceStreamPaintOwners.set($voiceStreamPaintOwners.get() + 1)

  return () => {
    $voiceStreamPaintOwners.set($voiceStreamPaintOwners.get() - 1)
  }
}
