/**
 * Vendored from Hermes Desktop — do not refactor. See donor/README.md.
 * Source:  apps/desktop/src/app/chat/sidebar/use-fleet-roster.ts
 * Commit:  2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19 (v0.23.0)
 * License: MIT — Copyright (c) 2025 Nous Research (LICENSE.donor)
 * Edits: none
 */
import { useEffect } from 'react'

import { refreshFleetRoster } from '@/store/fleet-roster'
import { $gatewayState } from '@/store/session'

/**
 * Keep the fleet roster fresh for the profile rail while more than one
 * gateway is registered: pull on mount, when the window regains focus or
 * visibility, immediately when the connection registry changes, and when the
 * gateway (re)opens. No timer — the multi-connection contract rules out
 * periodic fleet polling from the sidebar, and a 60s stale window in the store
 * absorbs focus churn.
 *
 * The open edge matters on a cold start: the first pull races `gateway
 * ensure`, whose boot outlives the roster's per-source deadline, so This
 * device enumerates as unreachable (one square instead of its profiles) and
 * nothing else would ask again until a window focus.
 */
export function useFleetRoster(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    void refreshFleetRoster()

    const onFocus = () => void refreshFleetRoster()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshFleetRoster()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const offRegistry = window.hermesDesktop?.connections?.onChanged?.(() => void refreshFleetRoster({ force: true }))
    let wasOpen = $gatewayState.get() === 'open'

    const offGateway = $gatewayState.listen(state => {
      const open = state === 'open'

      if (open && !wasOpen) {
        void refreshFleetRoster({ force: true })
      }

      wasOpen = open
    })

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      offRegistry?.()
      offGateway()
    }
  }, [enabled])
}
