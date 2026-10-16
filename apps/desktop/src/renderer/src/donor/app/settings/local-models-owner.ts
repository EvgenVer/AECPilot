/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/settings/local-models-owner.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
