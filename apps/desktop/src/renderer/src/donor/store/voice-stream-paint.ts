/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/voice-stream-paint.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
