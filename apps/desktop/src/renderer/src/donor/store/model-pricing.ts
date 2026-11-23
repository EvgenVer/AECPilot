/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/model-pricing.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import { persistBoolean, storedBoolean } from '@/lib/storage'

const KEY = 'hermes.desktop.model-pricing.v1'

/** Whether the model picker shows per-model token prices. Off by default: most rows are noise until you're comparing cost. */
export const $showModelPricing = atom(storedBoolean(KEY, false))

$showModelPricing.subscribe(on => persistBoolean(KEY, on))

export function setShowModelPricing(on: boolean) {
  $showModelPricing.set(on)
}
