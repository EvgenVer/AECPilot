/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/free-tier.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { runFreeTierChallenge } from '@/store/free-tier-challenge'
import { activeGatewayConnectionId, requestGatewayForAgent } from '@/store/gateway'

import type { GatewayEventContext } from './types'

/**
 * free_tier.challenge: the account service wants a browser challenge cleared
 * before it mints the free-tier token. The backend polls for the result on its
 * own; this only gets the page loaded (hidden). Any source's challenge is worth
 * running: it is the install's identity, not the focused session's.
 */
export function handleFreeTierEvent({ deps, event, payload }: GatewayEventContext): boolean {
  if (event.type !== 'free_tier.challenge') {
    return false
  }

  const connectionId = event.connectionId ?? activeGatewayConnectionId()
  const profile = event.profile ?? deps.activeGatewayProfile

  void runFreeTierChallenge(payload, (method, params) => requestGatewayForAgent(connectionId, profile, method, params))

  return true
}
