/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/gateway-reconnect.ts
 * Commit:  f97608f178d1ffeca59860195ab7da295f7c8e5f (v2026.9.24)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { translateNow } from '@/i18n'

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

/** Toast button that re-dials the active connection — attached wherever a
 *  send fails because Hermes is offline (sudo/secret/approval prompts …). */
export function reconnectAction(): { label: string; onClick: () => void } {
  return {
    label: translateNow('prompts.reconnect'),
    onClick: () => void reconnectGateway().catch(() => undefined)
  }
}
