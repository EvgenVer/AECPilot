/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/onboarding.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import type { GatewayEvent } from '@hermes/shared'

import { noteOnboardingEnded } from '@/store/onboarding-run'

import type { GatewayEventContext } from './types'

/** onboarding.ended: a first-run run ended. Every source's event counts: the run is the install's, and
 *  the window showing it may be subscribed to another chat or profile. */
export function handleOnboardingEvent({ event }: GatewayEventContext): boolean {
  if (event.type !== 'onboarding.ended') {
    return false
  }

  // SAFETY: the type check above; the backend checks the payload against OnboardingEndedPayload.
  const ended = (event as GatewayEvent<'onboarding.ended'>).payload

  if (ended) {
    noteOnboardingEnded(ended)
  }

  return true
}
