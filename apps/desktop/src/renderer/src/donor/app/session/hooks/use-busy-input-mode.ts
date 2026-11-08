/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-busy-input-mode.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import type { GatewayRequester } from '@/app/contrib/types'
import {
  $busyInputConfig,
  type BusyInputMode,
  busyInputOwnerKey,
  normalizeBusyInputMode
} from '@/store/busy-input-mode'
import { serverOwnsComposerQueue } from '@/store/composer-queue'
import { $connectionWires } from '@/store/connection-wire'
import { $activeGatewayProfile } from '@/store/profile'
import { $connection, $gatewayState, knownSessionOwner, ownerLookupSessionRows } from '@/store/session'
import { requestForSessionProfile } from '@/store/session-request-router'
import { sessionTileOwnerRoute } from '@/store/session-states'

export function useBusyInputMode({
  sessionId,
  storedSessionId,
  requestGateway
}: {
  sessionId: string | null
  storedSessionId: string | null
  requestGateway: GatewayRequester
}): BusyInputMode | null {
  const config = useStore($busyInputConfig)
  const connection = useStore($connection)
  const profile = useStore($activeGatewayProfile)
  const gatewayState = useStore($gatewayState)
  // A public connection's wire is known only at its gateway.ready; re-read ownership then.
  useStore($connectionWires)

  const route = storedSessionId
    ? (sessionTileOwnerRoute(storedSessionId) ?? knownSessionOwner(ownerLookupSessionRows(), storedSessionId))
    : undefined

  const connectionId = route && typeof route === 'object' ? route.connectionId : connection?.connectionId
  const ownerProfile = route && typeof route === 'object' ? route.profile : route || profile
  const targetProfile = route && typeof route === 'object' ? route.targetProfile : undefined
  const owner = busyInputOwnerKey(connectionId, targetProfile || ownerProfile)

  const [loaded, setLoaded] = useState<{ owner: string; connection: typeof connection; sessionId: string; mode: BusyInputMode } | null>(
    null
  )

  const canonical = serverOwnsComposerQueue(sessionId ?? storedSessionId)
  const configured = !canonical && config?.owner === owner && config.connection === connection ? config.mode : null

  useEffect(() => {
    if (configured !== null || !sessionId || gatewayState !== 'open') {
      return
    }

    let cancelled = false
    const ownerRoute = connectionId ? { connectionId, profile: ownerProfile, targetProfile } : ownerProfile
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    const load = () => {
      attempts += 1
      void requestForSessionProfile<{ value?: unknown }>(ownerRoute, requestGateway, 'config.get', {
        key: 'busy',
        session_id: sessionId
      })
        .then(result => {
          if (!cancelled && result && Object.hasOwn(result, 'value')) {
            setLoaded({ owner, connection, sessionId, mode: normalizeBusyInputMode(result.value) })
          }
        })
        .catch(() => {
          // A failed read must not strand busy Enter on an otherwise healthy socket.
          if (!cancelled && attempts < 3) {retryTimer = setTimeout(load, 1000 * attempts)}
        })
    }

    load()

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [
    configured,
    connection,
    connectionId,
    gatewayState,
    owner,
    ownerProfile,
    requestGateway,
    sessionId,
    targetProfile
  ])

  if (gatewayState !== 'open') {
    return null
  }

  return configured ?? (loaded?.owner === owner && loaded.connection === connection && loaded.sessionId === sessionId ? loaded.mode : null)
}
