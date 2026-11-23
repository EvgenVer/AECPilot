/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/store/gateway-request-scope.ts
 * Commit:  caafe5389ae585ef77387a962aee05b1bcf17029 (v0.23.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { batch } from 'nanostores'

import { getApiRequestConnection, setApiRequestProfile } from '@/api/client'
import { setApiRequestConnection } from '@/hermes'

/**
 * Point the ambient REST scope at `connectionId`, served by `profile`, in ONE
 * notification frame. A profile belongs to one gateway: publishing the
 * connection alone left the scope naming (new gateway, old profile) until the
 * profile mirror caught up, and a scope listener firing in that gap (the
 * version poller) made main dial a backend for a profile that gateway does not
 * have. The profile half moves only with the connection: on the same
 * connection the profile mirror owns it (a shared-primary socket serves
 * profiles other than its own route's).
 */
export function publishRequestConnection(connectionId: null | string, profile: string): void {
  batch(() => {
    if ((connectionId || null) !== getApiRequestConnection()) {
      setApiRequestProfile(profile)
    }

    setApiRequestConnection(connectionId)
  })
}
