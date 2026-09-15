/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/session-control.ts
 * Commit:  939e45c91d751fadd94dcd1b873ac3cb44846213 (v2026.9.11)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { applySessionControlUpdate } from '@/store/session-control'

import type { GatewayEventContext } from './types'

export function handleControlEvent(ctx: GatewayEventContext): boolean {
  const { event, payload, sessionId } = ctx

  if (event.type !== 'session.control.update') {
    return false
  }

  if (!sessionId) {
    return true
  }

  const control = payload && typeof payload === 'object' ? (payload as { control?: unknown }).control : undefined
  applySessionControlUpdate(sessionId, control)

  return true
}
