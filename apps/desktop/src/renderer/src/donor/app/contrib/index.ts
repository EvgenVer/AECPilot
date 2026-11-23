/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/contrib/index.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The contribution-driven shell package. `controller` registers panes /
// layouts / chrome and mounts the app root; `wiring` is the data controller +
// memoized pane surfaces; `panes` holds the real-data pane bodies + statusbar
// group setters. Only the controller is a public entry (the app root renders
// it); the rest are internal to this directory.
export { ContribController } from './controller'
export { ContribWiring, WiredPane } from './wiring'
