/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/components/remote-display-banner.tsx
 * Commit:  3c27eb6234bf91b8ceee9e9071591b31e9b148cb (v2026.8.3)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect } from 'react'

import { translateNow } from '@/i18n'
import { notify } from '@/store/notifications'

// GPU acceleration is disabled under remote display (RDP/VNC/etc) to avoid
// flicker. Surfaces once per launch as a persistent toast through the shared
// notification stack — was a hand-rolled second top-center card at these same
// exact fixed coordinates, which could overlap a real toast.
export function RemoteDisplayBanner() {
  useEffect(() => {
    void window.hermesDesktop?.getRemoteDisplayReason?.().then(reason => {
      if (reason) {
        notify({
          durationMs: 0,
          kind: 'info',
          message: translateNow('remoteDisplayBanner.message', reason),
          placement: 'default'
        })
      }
    })
  }, [])

  return null
}
