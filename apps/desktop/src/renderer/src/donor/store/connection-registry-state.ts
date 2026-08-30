/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/connection-registry-state.ts
 * Commit:  5fc308a70719a83cccdbba4c0e39c23f5a8239d5 (v2026.8.27)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import type { DesktopConnectionsRegistry } from '@/global'

/** Null only for the legacy profile-only Desktop topology. Once Electron has
 * published a registry, profile names are source-local and are not owners. */
export const $connectionsRegistry = atom<DesktopConnectionsRegistry | null>(null)

export function hasRegistryTopology(): boolean {
  // The bridge exists before its asynchronous cache load. Treat that window
  // (and a failed list IPC) as registry topology so owner routing fails closed;
  // only an older Desktop without the registry capability is truly legacy.
  return $connectionsRegistry.get() !== null || Boolean(window.hermesDesktop?.connections?.list)
}
