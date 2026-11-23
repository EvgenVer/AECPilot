/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/use-card-waiting-submit.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useStore } from '@nanostores/react'
import { useMemo } from 'react'

import { sessionOnboardingCardWaiting } from '@/store/parked-card-answers'

/** In the onboarding chat typed text answers a waiting card through Send; an empty draft still offers Stop. */
export function useCardWaitingSubmit(sessionId: null | string, busy: boolean, hasPayload: boolean) {
  const cardWaiting = useStore(useMemo(() => sessionOnboardingCardWaiting(sessionId), [sessionId]))

  return { canSubmit: busy || hasPayload, cardWaiting }
}
