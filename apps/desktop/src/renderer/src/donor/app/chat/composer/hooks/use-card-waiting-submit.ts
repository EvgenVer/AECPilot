/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/composer/hooks/use-card-waiting-submit.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
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
