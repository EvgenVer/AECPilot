/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/backdrop.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistStore } from '@/lib/persist-store'
import { persistBoolean, storedBoolean } from '@/lib/storage'

import { recordFeatureToggle } from './desktop-metrics'

const KEY = 'hermes.desktop.backdrop.v1'

/** Whether the faint statue image renders behind the chat transcript. */
export const $backdrop = atom(storedBoolean(KEY, false))

persistStore($backdrop, (on, options) => persistBoolean(KEY, on, options), false)

export function setBackdrop(on: boolean) {
  recordFeatureToggle('backdrop', $backdrop.get(), on)
  $backdrop.set(on)
}
