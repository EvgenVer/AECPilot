/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/assistant-ui/use-connection-owner.ts
 * Commit:  d923a5eb487a17c0a68801bba9ef0f56c81040a8 (v0.22.2)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect, useState } from 'react'

import { type ConnectionOwner, connectionOwnerFor } from '@/store/connection-request'

/** The gateway route that owns a session's connection operation. Null until it resolves and null when it cannot: a card RPC must reach the
 *  gateway that holds the operation, never whichever one the window happens to have in front. */
export function useConnectionOwner(sessionId: null | string, active: boolean): ConnectionOwner | null {
  const [owner, setOwner] = useState<ConnectionOwner | null>(null)

  useEffect(() => {
    if (!sessionId || !active) {
      setOwner(null)

      return
    }

    let cancelled = false

    void connectionOwnerFor(sessionId, 'connectors.connect').then(resolved => {
      if (!cancelled) {
        setOwner(resolved)
      }
    })

    return () => {
      cancelled = true
    }
  }, [active, sessionId])

  return owner
}
