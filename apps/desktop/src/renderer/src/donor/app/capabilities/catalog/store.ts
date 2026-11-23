/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/capabilities/catalog/store.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { Codecs, persistentAtom } from '@/lib/persisted'

// One browsing layout across Skills and Plugins; Installed keeps its own list.
export const $catalogCardView = persistentAtom('hermes.desktop.capabilities.catalogCardView', true, Codecs.bool)
