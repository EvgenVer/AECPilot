/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/model-pricing.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
