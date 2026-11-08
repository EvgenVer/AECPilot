/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/lib/signed-out-status.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
/**
 * Whether an `/api/status` answer is the trimmed body the gateway's Webapp gives a caller it does
 * not count as signed in. `/api/status` is public, so the gate never refreshes on it: a signed-in
 * tab whose access token expired since its last gated request also gets this body, until its next
 * gated request rotates the cookies. The body says nothing about the gateway's profiles or the
 * install, so a reader keeps the answer it already has instead of reading the missing fields as
 * an older backend. The full body always carries `active_sessions`, and on a gated bind
 * `auth_required` is true.
 */
export function isSignedOutStatus(status: unknown): boolean {
  if (!status || typeof status !== 'object') {
    return false
  }

  const body = status as Record<string, unknown>

  return body.auth_required === true && !('active_sessions' in body) && !('install_id' in body)
}
