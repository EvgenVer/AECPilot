/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/profile-owner-rename.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { normalizeProfileKey } from './profile'
import type { SessionProfileRoute } from './session-request-router'

/** A LOCAL owner route that named profile `from` (as its profile or backend target) names `to` after a rename;
 *  any other route, and one the rename does not touch, is returned as is. */
export function renameLocalOwnerRoute(
  owner: SessionProfileRoute | undefined,
  from: string,
  to: string
): SessionProfileRoute | undefined {
  if (!owner || (String(owner.connectionId ?? '').trim() || 'local') !== 'local') {
    return owner
  }

  const profile = normalizeProfileKey(owner.profile) === from ? to : owner.profile
  const targetProfile = normalizeProfileKey(owner.targetProfile) === from ? to : owner.targetProfile

  return profile === owner.profile && targetProfile === owner.targetProfile
    ? owner
    : { ...owner, profile, ...(targetProfile === undefined ? {} : { targetProfile }) }
}
