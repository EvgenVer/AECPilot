/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/index.tsx
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The app root is the contribution-driven shell: panes, titlebar/statusbar
// items, keybinds, palette commands, routes, and themes all register through
// the contribution registry (src/contrib) — core surfaces use the same calls
// plugins do. Everything lives under ./contrib: the wiring (gateway boot,
// sessions, streams) + pane surfaces, and the pane/layout registration.
export { ContribController as default } from './contrib'
