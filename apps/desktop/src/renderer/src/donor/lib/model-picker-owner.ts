/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/model-picker-owner.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { SessionOwnerRoute } from '@/store/session-request-router'

interface ModelPickerOwnerInput {
  ambientConnectionId?: string
  ambientProfile: string
  focusedStoredSessionId: null | string
  selectedStoredSessionId: null | string
  sessionTiles: readonly {
    ownerRoute?: SessionOwnerRoute
    storedSessionId: string
  }[]
}

export interface ModelPickerOwner {
  connectionId?: string
  profile: string
  route?: SessionOwnerRoute
}

/** Resolve one coherent owner for every picker operation. A tile route wins
 * only when the tile, rather than the primary session, owns keyboard focus. */
export function resolveModelPickerOwner({
  ambientConnectionId,
  ambientProfile,
  focusedStoredSessionId,
  selectedStoredSessionId,
  sessionTiles
}: ModelPickerOwnerInput): ModelPickerOwner {
  const route =
    focusedStoredSessionId && focusedStoredSessionId !== selectedStoredSessionId
      ? sessionTiles.find(tile => tile.storedSessionId === focusedStoredSessionId)?.ownerRoute
      : undefined

  return {
    connectionId: route?.connectionId || ambientConnectionId,
    profile: route?.targetProfile || route?.profile || ambientProfile,
    route
  }
}
