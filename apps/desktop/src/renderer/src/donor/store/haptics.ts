/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/haptics.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistStore } from '@/lib/persist-store'
import { persistBoolean, storedBoolean } from '@/lib/storage'

const HAPTICS_MUTED_STORAGE_KEY = 'hermes.desktop.hapticsMuted'

export const $hapticsMuted = atom(storedBoolean(HAPTICS_MUTED_STORAGE_KEY, false))

persistStore($hapticsMuted, (muted, options) => persistBoolean(HAPTICS_MUTED_STORAGE_KEY, muted, options), false)

// Keep automatic cues quiet in every open window, not just the settings window.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === HAPTICS_MUTED_STORAGE_KEY) {
      $hapticsMuted.set(storedBoolean(HAPTICS_MUTED_STORAGE_KEY, false))
    }
  })
}

export function setHapticsMuted(muted: boolean) {
  $hapticsMuted.set(muted)
}

export function toggleHapticsMuted() {
  $hapticsMuted.set(!$hapticsMuted.get())
}
