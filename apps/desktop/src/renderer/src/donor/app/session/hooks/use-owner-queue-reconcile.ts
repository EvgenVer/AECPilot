/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-owner-queue-reconcile.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect } from 'react'

import { watchOwnerQueues } from '@/store/owner-queue-reconcile'

/** Re-read the owner's queue of chats holding owner work on every edge into an open gateway. */
export function useOwnerQueueReconcile(requestGateway: Parameters<typeof watchOwnerQueues>[0]): void {
  useEffect(() => watchOwnerQueues(requestGateway), [requestGateway])
}
