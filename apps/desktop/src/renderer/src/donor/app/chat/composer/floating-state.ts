/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/floating-state.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
