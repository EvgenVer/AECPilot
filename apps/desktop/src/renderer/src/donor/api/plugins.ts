/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/api/plugins.ts
 * Commit:  345cd2b057a452236de401d3534b8502a7465e8d (v2026.9.14)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits:
 *   [5] their product name in user-visible strings → ours (SPEC C12)
 *   [3] removed `pluginSocket` (core plugin catalog is a non-goal, HX5) and the
 *       now-unused `reconnectBackoffDelayMs` import it was the only caller of
 * (no other edits)
 */
import { reconnectBackoffDelayMs } from '@hermes/shared'

import type { HermesConnection } from '@/global'
import { RECONNECT_ATTEMPT_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'

import { getApiRequestConnection, getApiRequestProfile, hermesApi, profileScoped } from './client'

/** Resolve the ACTIVE backend's connection descriptor, (connectionId,
 *  profile)-scoped — mirroring how store/profile resolves $connection: a
 *  registry agent's descriptor comes from getConnectionFor (its SOURCE
 *  connection), everything else from the profile-keyed local pool. The
 *  getConnectionFor bridge is optional (older Desktop mains); without it the
 *  profile-scoped pool lookup is the best available answer.
 *
 *  Both branches are IPC round-trips into the main process with no timeout of
 *  their own (#93454) — a wedged main-process round-trip otherwise hangs
 *  pluginSocket's connect() forever instead of falling back to the polling
 *  fallback every consumer already has. Bound the same way store/gateway's
 *  openSecondary bounds the same *For/plain pair.
 *
 *  Exported for tests. */
export async function activeConnection(): Promise<HermesConnection> {
  const getConnectionFor = window.hermesDesktop.getConnectionFor
  const connectionId = getApiRequestConnection()
  const profile = getApiRequestProfile()

  if (connectionId && getConnectionFor) {
    return withTimeout(
      getConnectionFor({ connectionId, profile }),
      RECONNECT_ATTEMPT_TIMEOUT_MS,
      `Timed out connecting to profile "${profile}"`
    )
  }

  return withTimeout(
    window.hermesDesktop.getConnection(profile),
    RECONNECT_ATTEMPT_TIMEOUT_MS,
    `Timed out connecting to profile "${profile}"`
  )
}

/** Options for a plugin REST call — mirrors the app's own `hermesDesktop.api`
 *  shape, minus the path (which is namespace-derived). */
export interface PluginRestOptions {
  method?: string
  body?: unknown
  /** Single-file multipart upload (see HermesApiRequest.upload). */
  upload?: { filename: string; contentType?: string; bytes: ArrayBuffer }
  timeoutMs?: number
}

// Normalize `path` to a leading-slash suffix relative to `/api/plugins/<id>`.
// The namespace is the boundary — reject `..` so a relative segment can't
// normalize out into another plugin's API or a core route. Check the path
// portion only (before any query/hash).
function pluginPathSuffix(caller: string, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`

  if (suffix.split(/[?#]/, 1)[0].split('/').includes('..')) {
    throw new Error(`${caller}: illegal path traversal in "${path}"`)
  }

  return suffix
}

/** The plugin REST door. Every call is scoped BY CONSTRUCTION to the plugin's
 *  own backend namespace — `path` is relative to `/api/plugins/<pluginId>`
 *  ('/board' → `/api/plugins/kanban/board`), so a plugin can't address another
 *  plugin's API or a core route through it. Profile-aware like every desktop
 *  REST call. Broader reach (core endpoints, another namespace) is the future
 *  declared-capability seam; today the namespace IS the boundary. */
export async function pluginRest<T>(pluginId: string, path: string, opts: PluginRestOptions = {}): Promise<T> {
  if (!window.hermesDesktop?.api) {
    throw new Error('AECPilot desktop bridge unavailable')
  }

  const suffix = pluginPathSuffix('pluginRest', path)

  return hermesApi<T>({
    path: `/api/plugins/${pluginId}${suffix}`,
    method: opts.method,
    body: opts.body,
    upload: opts.upload,
    timeoutMs: opts.timeoutMs,
    ...profileScoped()
  })
}

// EDIT [3]: pluginSocket is removed — it opened a WebSocket straight from the
// renderer for a plugin backend, and the core plugin catalogue is a non-goal
// (HX5). Its reconnectBackoffDelayMs import goes with it: inside this file the
// removed function was its only caller.
