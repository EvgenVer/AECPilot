/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/shell/group-setter.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// The `GroupSetter` shape pages take as an extension-point prop (CapabilitiesView,
// MessagingView, ChatPreviewRail, …). The live implementation is the
// registry-backed `registryGroupSetter` in app/contrib/panes.tsx.
type Side = 'left' | 'right'

export type GroupSetter<T> = (id: string, items: readonly T[], side?: Side) => void
