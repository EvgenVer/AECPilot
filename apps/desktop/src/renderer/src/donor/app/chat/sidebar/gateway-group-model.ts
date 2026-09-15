/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/gateway-group-model.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'
import { useMemo } from 'react'

import type { SessionInfo } from '@/hermes'
import { resolveProfileColor } from '@/lib/profile-color'
import { $connectionsRegistry } from '@/store/connection-registry-state'
import { $profileColors, normalizeProfileKey } from '@/store/profile'

import type { SidebarSessionGroup } from './projects/workspace-groups'

/** Group identity never depends on a mutable label, URL, or the active gateway. */
export function useGatewaySessionGroups(sessions: SessionInfo[], enabled: boolean) {
  const registry = useStore($connectionsRegistry)
  const colors = useStore($profileColors)

  return useMemo<SidebarSessionGroup[] | undefined>(() => {
    if (!enabled) {
      return undefined
    }

    const groups = new Map<string, SidebarSessionGroup>()

    for (const session of sessions) {
      const profile = normalizeProfileKey(session.profile)
      const connectionId = session.connection_id || null
      const id = JSON.stringify([connectionId, profile])
      const gateway = registry?.connections.find(connection => connection.id === connectionId)
      const label = connectionId ? `${gateway?.label || connectionId} · ${profile}` : profile

      const group: SidebarSessionGroup = groups.get(id) ?? {
        id,
        label,
        connectionId,
        profile,
        mode: 'profile',
        path: null,
        color: resolveProfileColor(profile, colors),
        sessions: []
      }

      group.sessions.push(session)
      groups.set(id, group)
    }

    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
  }, [sessions, enabled, registry, colors])
}
