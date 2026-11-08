/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/local-models-owner.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { createContext, useContext } from 'react'

import type { LocalModelsOwner } from '@/store/local-runtime-jobs'

// The pane remounts per owner and every request inside it must stay pinned to
// the owner it mounted with; re-deriving from the live stores in a child
// could retarget an in-flight action at the next connection or profile.
const LocalModelsOwnerContext = createContext<LocalModelsOwner | null>(null)

export const LocalModelsOwnerProvider = LocalModelsOwnerContext.Provider

export function useScopedLocalModelsOwner(): LocalModelsOwner {
  const owner: LocalModelsOwner | null = useContext(LocalModelsOwnerContext)

  if (!owner) {
    throw new Error('useScopedLocalModelsOwner must be used inside LocalModelsOwnerProvider')
  }

  return owner
}
