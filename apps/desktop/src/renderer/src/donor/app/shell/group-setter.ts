/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/shell/group-setter.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The `GroupSetter` shape pages take as an extension-point prop (CapabilitiesView,
// MessagingView, ChatPreviewRail, …). The live implementation is the
// registry-backed `registryGroupSetter` in app/contrib/panes.tsx.
type Side = 'left' | 'right'

export type GroupSetter<T> = (id: string, items: readonly T[], side?: Side) => void
