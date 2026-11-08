/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/pane-shell/index.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
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
