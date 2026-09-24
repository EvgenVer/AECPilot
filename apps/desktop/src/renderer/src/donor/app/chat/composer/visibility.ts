/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/visibility.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { createContext, useContext } from 'react'

import { usePaneVisible } from '@/components/pane-shell/pane-visibility'

/** Editor visibility is narrower than chat visibility while a shared float is
 * active. Background queues and explicit session actions still belong to the pane. */
export const ComposerVisibleContext = createContext<boolean | null>(null)

export function useComposerVisible(): boolean {
  const composer = useContext(ComposerVisibleContext)
  const pane = usePaneVisible()

  return composer ?? pane
}
