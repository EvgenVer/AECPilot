/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/hooks/use-profile-switch-latch.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useState } from 'react'

interface QueryStamps {
  dataUpdatedAt: number
  errorUpdatedAt?: number
}

/**
 * Freshness latch for a React Query record across a gateway-profile switch.
 * `arm()` (call it from `useOnProfileSwitch`) remembers the stamps the query
 * carries for the OUTGOING profile; `pending` stays true until the query
 * resettles for the new profile — a fresh success bumps `dataUpdatedAt`, a
 * fresh failure bumps `errorUpdatedAt` (when supplied). The timestamps are
 * the freshness proof because React Query structurally shares results, so a
 * profile with identical settings reuses the very same object reference.
 */
export function useProfileSwitchLatch({ dataUpdatedAt, errorUpdatedAt }: QueryStamps): {
  arm: () => void
  pending: boolean
} {
  const [stale, setStale] = useState<null | QueryStamps>(null)

  return {
    arm: () => setStale({ dataUpdatedAt, errorUpdatedAt }),
    pending: stale !== null && dataUpdatedAt === stale.dataUpdatedAt && errorUpdatedAt === stale.errorUpdatedAt
  }
}
