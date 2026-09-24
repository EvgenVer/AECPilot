/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/floating-state.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
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
