/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/completion-route.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { HermesGateway } from '@/hermes'
import { ambientRequestFor } from '@/store/session-gone-latch'
import { sessionOwnerIsKnown } from '@/store/session-owner-resolution'
import { isSessionOwnerRoute, requestForSessionProfile, type SessionOwnerScope } from '@/store/session-request-router'
import { knownOwnerForSession } from '@/store/session-states'

/**
 * Where a composer completion RPC (`commands.catalog`, `complete.slash`,
 * `complete.path`) for `sessionId` goes: the session's OWNER, never the
 * window's ambient socket. On a multiplexed local gateway the ambient socket's
 * authority is the launch profile's, which refuses another profile's
 * `session_id` as not_found — so a non-primary-profile window's palette said
 * "No matches" for every `/` and `@` (#141583). Resolved at call time, like
 * every session-scoped RPC (requestForSessionProfile).
 *
 * Completions are advisory: an owner nothing can name yet (a runtime whose
 * row/hint has not landed) rides the ambient socket instead of failing
 * closed — the worst case is the same empty list the user would see anyway.
 */
export function completionOwner(sessionId: null | string | undefined): SessionOwnerScope {
  const owner = sessionId ? knownOwnerForSession(sessionId) : undefined

  return sessionOwnerIsKnown(owner) ? owner : undefined
}

/** Cache-key fragment naming the backend that answered, so a result cached
 *  from one owner (or the ambient socket) is never served for another. */
export function completionOwnerKey(owner: SessionOwnerScope): string {
  if (isSessionOwnerRoute(owner)) {
    return `${owner.connectionId}::${owner.targetProfile ?? owner.profile}`
  }

  return owner ? `profile:${owner}` : 'ambient'
}

export function requestCompletion<T>(
  gateway: HermesGateway,
  owner: SessionOwnerScope,
  method: string,
  params: Record<string, unknown>
): Promise<T> {
  return requestForSessionProfile<T>(owner, ambientRequestFor(gateway), method, params)
}
