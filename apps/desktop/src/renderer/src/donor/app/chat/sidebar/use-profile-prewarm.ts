/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/use-profile-prewarm.ts
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useCallback, useEffect, useRef } from 'react'

import { prewarmProfileBackend } from '@/store/profile'

// Dwell before firing: long enough that sweeping the pointer across the rail
// or a mixed-profile session list doesn't spawn a backend for every element
// passed through, short enough to beat the click by hundreds of ms.
const PREWARM_DWELL_MS = 120

/**
 * pointerenter/pointerleave handlers that pre-warm `profile`'s pool backend
 * after a short hover dwell (see prewarmProfileBackend in store/profile).
 * Consumers merge these with their own pointer handlers.
 */
export function useProfilePrewarm(profile: string | null | undefined) {
  const timer = useRef<null | number>(null)
  const profileRef = useRef(profile)
  profileRef.current = profile

  const cancelPrewarm = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => cancelPrewarm, [cancelPrewarm])

  const startPrewarm = useCallback(() => {
    cancelPrewarm()
    timer.current = window.setTimeout(() => {
      timer.current = null
      prewarmProfileBackend(profileRef.current || 'default')
    }, PREWARM_DWELL_MS)
  }, [cancelPrewarm])

  return { cancelPrewarm, startPrewarm }
}
