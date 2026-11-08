/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/session/hooks/use-owner-queue-reconcile.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect } from 'react'

import { watchOwnerQueues } from '@/store/owner-queue-reconcile'

/** Re-read the owner's queue of chats holding owner work on every edge into an open gateway. */
export function useOwnerQueueReconcile(requestGateway: Parameters<typeof watchOwnerQueues>[0]): void {
  useEffect(() => watchOwnerQueues(requestGateway), [requestGateway])
}
