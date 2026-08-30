/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/fleet-roster.ts
 * Commit:  5fc308a70719a83cccdbba4c0e39c23f5a8239d5 (v2026.8.27)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

import type { DesktopAgentRoster } from '@/global'

// The union agent roster — every profile on every registered gateway — as
// Electron enumerates it over REST/SSH (`hermes:agents:roster`). Bot Mode and
// the Capabilities scope selector already read it; the Sessions profile rail
// is its third consumer. Fetched on demand only (mount / focus / registry
// change), never on a timer: the multi-connection docs rule out periodic
// fleet polling from the sidebar.
export const $fleetRoster = atom<DesktopAgentRoster | null>(null)

const FLEET_ROSTER_STALE_MS = 60_000

let fetchedAt = 0
let inflight: null | Promise<void> = null

export async function refreshFleetRoster(options: { force?: boolean } = {}): Promise<void> {
  const bridge = window.hermesDesktop?.getAgentRoster

  if (!bridge) {
    return
  }

  if (!options.force && $fleetRoster.get() && Date.now() - fetchedAt < FLEET_ROSTER_STALE_MS) {
    return
  }

  if (inflight) {
    return inflight
  }

  inflight = bridge()
    .then(roster => {
      $fleetRoster.set(roster)
      fetchedAt = Date.now()
    })
    .catch((error: unknown) => {
      // A failed enumeration keeps the last roster: the rail should not lose
      // a machine's squares because one refresh hit a sleeping box.
      console.warn('[fleet-roster] enumeration failed; keeping the previous roster', error)
    })
    .finally(() => {
      inflight = null
    })

  return inflight
}

/** @internal */
export function _resetFleetRosterForTests(): void {
  $fleetRoster.set(null)
  fetchedAt = 0
  inflight = null
}
