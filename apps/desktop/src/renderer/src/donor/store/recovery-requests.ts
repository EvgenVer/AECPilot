/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/recovery-requests.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { atom } from 'nanostores'

/**
 * Recovery intents raised from surfaces that have no React Router context or
 * no knowledge of the active profile — chiefly notification action buttons
 * fired from stores. The shell controller (`app/contrib/wiring.tsx`) owns
 * `navigate` and the active profile, so it consumes these and performs the
 * navigation / restart. Same shape as `$billingSettingsRequest`, generalised
 * to any in-app route.
 *
 * Both atoms carry a `seq` so an identical request twice in a row (the user
 * clicks the same toast button again) still fires.
 */

export interface RouteRequest {
  seq: number
  /** In-app hash route, e.g. `/settings?tab=keys&key=OPENAI_API_KEY`. */
  path: string
}

export const $routeRequest = atom<RouteRequest | null>(null)

let routeSeq = 0

export function requestRoute(path: string): void {
  routeSeq += 1
  $routeRequest.set({ seq: routeSeq, path })
}

/** Restart the local Hermes service for the profile currently in view. */
export const $backendRestartRequest = atom(0)

export function requestBackendRestart(): void {
  $backendRestartRequest.set($backendRestartRequest.get() + 1)
}
