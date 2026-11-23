/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/profile-scope.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { ALL_PROFILES, normalizeProfileKey } from '@/store/profile'
import type { SessionInfo } from '@/types/hermes'

/**
 * Sessions visible in one sidebar profile scope.
 *
 * ALL (`__all__`) returns the caller's list unchanged — including the
 * single-profile case, where Grouping → Profile persists that sentinel
 * while grouped rendering stays off. Never filter against `__all__`.
 */
export function filterSessionsByProfileScope(sessions: SessionInfo[], profileScope: string): SessionInfo[] {
  if (profileScope === ALL_PROFILES) {
    return sessions
  }

  const scope = normalizeProfileKey(profileScope)

  return sessions.filter(session => normalizeProfileKey(session.profile) === scope)
}
