/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/gateway-reconnect.ts
 * Commit:  e624e9fde561e1add9388384012b295fde669ade (v2026.8.18)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
type GatewayReconnectHandler = () => Promise<void> | void

let activeHandler: GatewayReconnectHandler | null = null
let inFlight: Promise<void> | null = null

export function registerGatewayReconnect(handler: GatewayReconnectHandler): () => void {
  activeHandler = handler

  return () => {
    if (activeHandler === handler) {
      activeHandler = null
    }
  }
}

export function reconnectGateway(): Promise<void> {
  if (inFlight) {
    return inFlight
  }

  const handler = activeHandler

  if (!handler) {
    return Promise.reject(new Error('Gateway reconnect is unavailable'))
  }

  inFlight = Promise.resolve()
    .then(handler)
    .finally(() => {
      inFlight = null
    })

  return inFlight
}
