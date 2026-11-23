/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/shared-gateway-restart.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { StatusResponse } from '@/types/hermes'

/** Profiles a gateway restart would blip when the polled profile is carried by the shared
 *  multiplexer, in display order (default first, then as recorded). `null` for a standalone
 *  gateway or an older backend that does not report `gateway_shared_with` — those keep the
 *  plain no-dialog restart. A record naming only one profile is not shared either. */
export function sharedGatewayProfiles(
  status: Pick<StatusResponse, 'gateway_shared_with'> | null | undefined
): null | string[] {
  const shared = status?.gateway_shared_with

  if (!Array.isArray(shared)) {
    return null
  }

  const names = [...new Set(shared.map(name => String(name).trim()).filter(Boolean))]

  if (names.length < 2) {
    return null
  }

  return names.sort((left, right) => (left === 'default' ? -1 : right === 'default' ? 1 : left.localeCompare(right)))
}
