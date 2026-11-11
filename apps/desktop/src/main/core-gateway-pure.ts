// The window on the core's single gateway — the rules, without processes (task T53.2,
// decision 0017; measured by T53.1: `runtime/contracts/single-gateway-0.23.0.md`).
//
// Which wire the window speaks is decided by WHERE the core is, not by what it answered:
// a full installation owns its core and asks for the one gateway (`gateway ensure`), and
// their `HermesGateway` then speaks the canonical protocol over our bridge. Everything
// else keeps the wire it has today: a server installation still runs `serve` with its
// persistent token for the client over the tunnel (T53.4 adds the gateway beside it), a
// remote or SSH connection reaches that `serve`, and the e2e mock (`AEC_GATEWAY_URL`) is a
// legacy gateway. Decided up front so the window can be told before the core is up.

import type { AppRole } from './install-mode-pure'

export type CoreWire = 'canonical' | 'legacy'

export function coreWire(input: {
  role: AppRole
  mode: 'local' | 'remote' | 'ssh'
  /** `AEC_GATEWAY_URL` set: the e2e mock stands in for the core. */
  gatewayOverride: boolean
}): CoreWire {
  if (input.gatewayOverride) return 'legacy'
  if (input.mode !== 'local') return 'legacy'
  return input.role === 'full' ? 'canonical' : 'legacy'
}

/**
 * A native-http ticket names one profile, and two routes refuse it unless the request names
 * its profile explicitly (`hermes_cli/dashboard_auth/native_http.py`, `_check_profile_scope`):
 * the cron job list «scans other profiles» by default, and the batched sidebar needs
 * `recents_profile`. On `serve` both defaulted to the launch profile; T53.1 measured 403
 * without the selector and 200 with it. The selector added is the profile the window works
 * in; a request that already names one is left alone.
 */
export function scopeGatewayRestPath(restPath: string, method: string, profile: string): string {
  const url = new URL(restPath, 'http://gateway.invalid')
  const pathname = url.pathname.replace(/\/+$/, '')
  let key: string | null = null
  if (pathname === '/api/cron/jobs' || pathname.startsWith('/api/cron/jobs/')) key = 'profile'
  else if (pathname === '/api/profiles/sessions/sidebar' && method.toUpperCase() === 'GET') {
    key = 'recents_profile'
  }
  if (!key || url.searchParams.get(key)) return restPath
  url.searchParams.set(key, profile)
  return `${url.pathname}${url.search}`
}

/** The profile name of a ticket's home: `default` for the launch home, else the folder name
 *  under `profiles/`. */
export function windowProfile(sessionProfile: string | undefined): string {
  return sessionProfile && sessionProfile.trim() ? sessionProfile.trim() : 'default'
}
