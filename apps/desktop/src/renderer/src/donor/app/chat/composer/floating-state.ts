/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/floating-state.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import type { ComposerTarget } from './focus'

export interface FloatingComposerOwner {
  id: string
  groupId: string
  target: ComposerTarget
}

/** User intent, not whichever editor happened to receive a delayed DOM focus. */
export const $floatingComposerOwner = atom<FloatingComposerOwner | null>(null)
