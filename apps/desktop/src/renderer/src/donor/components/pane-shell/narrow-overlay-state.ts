/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/pane-shell/narrow-overlay-state.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/** Transient visible overlay pane ids (including aliases and zone mates).
 * Docked/persisted open flags do not describe the narrow overlay. */
export const $narrowOverlayPaneIds = atom<ReadonlySet<string>>(new Set())
