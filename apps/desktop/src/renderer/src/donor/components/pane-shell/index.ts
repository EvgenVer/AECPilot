/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/pane-shell/index.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Cross-surface event: toggle-reveal a collapsed pane. Dispatched by the
 * keybinds (⌘B / ⌘G / titlebar toggles on narrow viewports) with the pane id
 * in `detail`; the layout tree's narrow overlays (tree/renderer.tsx) listen
 * and slide the pane over the grid.
 */
export const PANE_TOGGLE_REVEAL_EVENT = 'hermes:pane-toggle-reveal'
