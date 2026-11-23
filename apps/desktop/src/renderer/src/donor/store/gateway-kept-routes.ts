/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/gateway-kept-routes.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
// Routes Desktop keeps connected for the window's lifetime (store/gateway-persistence).
// A leaf module, so store/gateway can consult it without importing its consumer.
// Counted per route: a route stays kept until every holder has released it.
const kept = new Map<string, number>()
const openedListeners = new Set<() => void>()

const routeKey = (connectionId: null | string, profile: string) => `${connectionId ?? ''}\u0000${profile}`

/** Keep one route's socket open against every idle-dispose path. Returns the release (idempotent). */
export function keepRoute(connectionId: string, profile: string): () => void {
  const key = routeKey(connectionId, profile)
  kept.set(key, (kept.get(key) ?? 0) + 1)
  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    const holders = (kept.get(key) ?? 1) - 1

    if (holders > 0) {
      kept.set(key, holders)
    } else {
      kept.delete(key)
    }
  }
}

export function isKeptRoute(connectionId: null | string, profile: string): boolean {
  return kept.has(routeKey(connectionId, profile))
}

/** Fires each time a kept route's socket opens, first dial or automatic reconnect alike. */
export function onKeptRouteOpened(handler: () => void): () => void {
  openedListeners.add(handler)

  return () => openedListeners.delete(handler)
}

export function keptRouteOpened(connectionId: null | string, profile: string): void {
  if (isKeptRoute(connectionId, profile)) {
    openedListeners.forEach(handler => handler())
  }
}
