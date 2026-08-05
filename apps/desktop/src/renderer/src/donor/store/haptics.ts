/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/haptics.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

const HAPTICS_MUTED_STORAGE_KEY = 'hermes.desktop.hapticsMuted'

export const $hapticsMuted = atom(storedBoolean(HAPTICS_MUTED_STORAGE_KEY, false))

$hapticsMuted.subscribe(muted => persistBoolean(HAPTICS_MUTED_STORAGE_KEY, muted))

export function setHapticsMuted(muted: boolean) {
  $hapticsMuted.set(muted)
}

export function toggleHapticsMuted() {
  $hapticsMuted.set(!$hapticsMuted.get())
}
